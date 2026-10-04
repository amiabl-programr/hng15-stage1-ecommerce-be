import { logger } from './logger.ts';
import { outboxModel } from '../models/outbox.model.ts';
import { mailClient } from '../providers/mail/index.ts';

/**
 * Drains pending messages from email_outbox table.
 * Exponential backoff up to 5 attempts. Never throws.
 */
export async function processOutboxBatch(batchSize = 10): Promise<{ processed: number; sent: number; failed: number; success: boolean }> {
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    const messages = await outboxModel.findPendingOutboxMessages(batchSize);
    processed = messages.length;

    if (processed > 0) {
      logger.info('processing email outbox batch', { count: processed });
    }

    for (const msg of messages) {
      const currentAttempt = msg.attempts + 1;
      const result = await mailClient.sendMail({
        to: msg.to_email,
        subject: msg.subject,
        html: msg.html_body,
        text: msg.text_body ?? undefined,
        attempt: currentAttempt,
      });

      if (result.success) {
        await outboxModel.markOutboxSent(msg.id).catch((err) => {
          logger.error('failed to mark outbox message sent', { id: msg.id, err: String(err) });
        });
        logger.info('outbox email delivered successfully', {
          id: msg.id,
          to: msg.to_email,
          subject: msg.subject,
          durationMs: result.durationMs,
        });
        sent++;
      } else {
        const nextAttempt = msg.attempts + 1;
        await outboxModel
          .markOutboxFailed(msg.id, nextAttempt, result.error || 'Delivery failed')
          .catch((err) => {
            logger.error('failed to update outbox message attempt', {
              id: msg.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        logger.error('outbox email delivery attempt failed', {
          id: msg.id,
          to: msg.to_email,
          subject: msg.subject,
          attempt: nextAttempt,
          error: result.error,
          code: result.code,
          command: result.command,
          responseCode: result.responseCode,
          durationMs: result.durationMs,
        });
        failed++;
      }
    }

    if (processed > 0) {
      logger.info('email outbox batch finished', { processed, sent, failed });
    }
    return { processed, sent, failed, success: true };
  } catch (error) {
    const cause = error instanceof Error && 'cause' in error ? error.cause : undefined;
    logger.error('outbox worker batch error', {
      error: error instanceof Error ? error.message : String(error),
      cause: typeof cause === 'object' && cause !== null ? JSON.stringify(cause) : (cause !== undefined ? String(cause) : undefined),
    });
    return { processed, sent, failed, success: false };
  }
}

export function startOutboxWorker(baseIntervalMs = 5000): { stop: () => void } {
  let isRunning = false;
  let isStopped = false;
  let consecutiveErrors = 0;
  let timer: NodeJS.Timeout | null = null;

  const scheduleNext = (delayMs: number) => {
    if (isStopped) return;
    timer = setTimeout(() => {
      if (isRunning || isStopped) return;
      isRunning = true;
      void (async () => {
        try {
          const res = await processOutboxBatch();
          if (res.success) {
            consecutiveErrors = 0;
            scheduleNext(baseIntervalMs);
          } else {
            consecutiveErrors++;
            const backoff = Math.min(baseIntervalMs * Math.pow(2, Math.min(consecutiveErrors, 4)), 60000);
            scheduleNext(backoff);
          }
        } catch {
          consecutiveErrors++;
          const backoff = Math.min(baseIntervalMs * Math.pow(2, Math.min(consecutiveErrors, 4)), 60000);
          scheduleNext(backoff);
        } finally {
          isRunning = false;
        }
      })();
    }, delayMs);
  };

  scheduleNext(baseIntervalMs);

  return {
    stop: () => {
      isStopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

export const outboxWorker = {
  processOutboxBatch,
  startOutboxWorker,
};
