import { env } from '../../config/env.ts';
import { logger } from '../../lib/logger.ts';
import { getMailTransporter } from './transport.ts';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string | undefined;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
  durationMs: number;
}

export async function sendMail(options: SendMailOptions): Promise<SendMailResult> {
  const start = Date.now();
  const config = env();

  try {
    const transporter = getMailTransporter();

    const info = await transporter.sendMail({
      from: config.mailFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    const durationMs = Date.now() - start;

    logger.info('email sent successfully', {
      to: options.to,
      subject: options.subject,
      messageId: info.messageId,
      durationMs,
    });

    return {
      success: true,
      messageId: info.messageId,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);

    logger.error('failed to send email', {
      to: options.to,
      subject: options.subject,
      error: errorMsg,
      durationMs,
    });

    return {
      success: false,
      error: errorMsg,
      durationMs,
    };
  }
}

export const mailClient = {
  sendMail,
};
