import { env } from '../../config/env.ts';
import { logger } from '../../lib/logger.ts';
import type { SendMailOptions, SendMailResult } from './index.ts';

const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

export async function sendMailViaResend(options: SendMailOptions): Promise<SendMailResult> {
  const start = Date.now();
  const config = env();

  const apiKey = config.resendApiKey;
  if (!apiKey) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured',
      durationMs: 0,
    };
  }

  // Determine sender: use RESEND_FROM if provided, otherwise config.mailFrom
  // If mailFrom is a @gmail.com address and RESEND_FROM is not set, Resend may require verified domain
  const fromAddress = config.resendFrom || config.mailFrom;

  try {
    const response = await fetch(RESEND_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text ?? undefined,
      }),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.error('failed to send email via Resend', {
        to: options.to,
        subject: options.subject,
        status: response.status,
        statusText: response.statusText,
        error: errBody,
        durationMs,
      });

      return {
        success: false,
        error: `Resend HTTP ${response.status}: ${errBody || response.statusText}`,
        responseCode: response.status,
        durationMs,
      };
    }

    const data = (await response.json()) as { id?: string };
    const messageId = data.id || 'resend-sent';

    logger.info('email sent successfully via Resend backup provider', {
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

    logger.error('unexpected error sending email via Resend', {
      to: options.to,
      subject: options.subject,
      error: message,
      durationMs,
    });

    return {
      success: false,
      error: `Resend client exception: ${message}`,
      durationMs,
    };
  }
}

export const resendClient = {
  sendMailViaResend,
};
