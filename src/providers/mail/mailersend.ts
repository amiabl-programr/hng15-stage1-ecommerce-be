import { env } from '../../config/env.ts';
import { logger } from '../../lib/logger.ts';
import type { SendMailOptions, SendMailResult } from './index.ts';

const MAILERSEND_API_ENDPOINT = 'https://api.mailersend.com/v1/email';

export function parseEmailAddress(raw: string, defaultName?: string): { email: string; name?: string } {
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/^(?:(?:"?([^"<]+)"?\s*)?<)?([^\s<>]+)>?$/);
  if (angleMatch && angleMatch[2]) {
    const name = angleMatch[1]?.trim() || defaultName;
    let email = angleMatch[2].trim();
    if (!email.includes('@') && email.includes('.')) {
      email = `info@${email}`;
    }
    return name ? { email, name } : { email };
  }

  let email = trimmed;
  if (!email.includes('@') && email.includes('.')) {
    email = `info@${email}`;
  }
  return defaultName ? { email, name: defaultName } : { email };
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
  const defaultSenderName = 'Roofing Construction Shop';
  const from = parseEmailAddress(rawFrom, defaultSenderName);
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
        fromEmail: from.email,
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
      fromEmail: from.email,
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
      fromEmail: from.email,
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
