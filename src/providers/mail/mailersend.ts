import { env } from '../../config/env.ts';
import { logger } from '../../lib/logger.ts';
import type { SendMailOptions, SendMailResult } from './index.ts';

const MAILERSEND_API_ENDPOINT = 'https://api.mailersend.com/v1/email';

export function parseEmailAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(?:(?:"?([^"<]+)"?\s*)?<)?([^\s<>@]+@[^\s<>@]+)>?$/);
  if (match && match[2]) {
    const name = match[1]?.trim();
    const email = match[2].trim();
    return name ? { email, name } : { email };
  }
  return { email: raw.trim() };
}

export async function sendMailViaMailerSend(options: SendMailOptions): Promise<SendMailResult> {
  const start = Date.now();
  const config = env();

  const apiKey = config.mailerSendKey;
  if (!apiKey) {
    return {
      success: false,
      error: 'MAILER_SEND_KEY is not configured',
      durationMs: 0,
    };
  }

  // Determine sender: use MAILER_SEND_FROM if provided, otherwise config.mailFrom
  const rawFrom = config.mailerSendFrom || config.mailFrom;
  const from = parseEmailAddress(rawFrom);
  const toRecipient = parseEmailAddress(options.to);

  try {
    const response = await fetch(MAILERSEND_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        from: {
          email: from.email,
          ...(from.name ? { name: from.name } : {}),
        },
        to: [
          {
            email: toRecipient.email,
            ...(toRecipient.name ? { name: toRecipient.name } : {}),
          },
        ],
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
      }),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.error('failed to send email via MailerSend', {
        to: options.to,
        subject: options.subject,
        status: response.status,
        statusText: response.statusText,
        error: errBody,
        durationMs,
      });

      return {
        success: false,
        error: `MailerSend HTTP ${response.status}: ${errBody || response.statusText}`,
        responseCode: response.status,
        durationMs,
      };
    }

    const messageId = response.headers.get('x-message-id') || 'mailersend-sent';

    logger.info('email sent successfully via MailerSend backup provider', {
      to: options.to,
      subject: options.subject,
      messageId,
      durationMs,
    });

    return {
      success: true,
      messageId,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    logger.error('unexpected error sending email via MailerSend', {
      to: options.to,
      subject: options.subject,
      error: message,
      durationMs,
    });

    return {
      success: false,
      error: `MailerSend client exception: ${message}`,
      durationMs,
    };
  }
}

export const mailerSendClient = {
  sendMailViaMailerSend,
  parseEmailAddress,
};
