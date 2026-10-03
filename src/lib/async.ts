import { logger } from './logger.ts';
import { outboxModel } from '../models/outbox.model.ts';
import { mailClient } from '../providers/mail/index.ts';

/**
 * Drains pending messages from email_outbox table.
 * Exponential backoff up to 5 attempts. Never throws.
 */
export async function processOutboxBatch(batchSize = 10): Promise<{ processed: number; sent: number; failed: number }> {
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    const messages = await outboxModel.findPendingOutboxMessages(batchSize);
    processed = messages.length;

    for (const msg of messages) {
      const result = await mailClient.sendMail({
        to: msg.to_email,
        subject: msg.subject,
        html: msg.html_body,
        text: msg.text_body ?? undefined,
      });

      if (result.success) {
        await outboxModel.markOutboxSent(msg.id).catch((err) => {
          logger.error('failed to mark outbox message sent', { id: msg.id, err: String(err) });
        });
        sent++;
      } else {
        const nextAttempt = msg.attempts + 1;
        await outboxModel
          .markOutboxFailed(msg.id, nextAttempt, result.error || 'Delivery failed')
          .catch((err) => {
            logger.error('failed to update outbox message attempt', { id: msg.id, err: String(err) });
          });
        failed++;
      }
    }
  } catch (error) {
    logger.error('outbox worker batch error', { error: String(error) });
  }

  return { processed, sent, failed };
}

export function startOutboxWorker(intervalMs = 5000): { stop: () => void } {
  let isRunning = false;

  const timer = setInterval(() => {
    if (isRunning) return;
    isRunning = true;
    void processOutboxBatch()
      .finally(() => {
        isRunning = false;
      });
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}

export const outboxWorker = {
  processOutboxBatch,
  startOutboxWorker,
};
