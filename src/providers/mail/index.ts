import { env } from '../../config/env.ts';
import { logger } from '../../lib/logger.ts';
import { getMailTransporter } from './transport.ts';
import { mailerSendClient } from './mailersend.ts';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string | undefined;
  attempt?: number | undefined;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
  code?: string | undefined;
  command?: string | undefined;
  response?: string | undefined;
  responseCode?: number | undefined;
  durationMs: number;
}

function diagnoseMailError(
  err: unknown,
  smtpHost: string,
  smtpPort: number,
): {
  message: string;
  code?: string | undefined;
  command?: string | undefined;
  response?: string | undefined;
  responseCode?: number | undefined;
  diagnostic: string;
} {
  const isObj = typeof err === 'object' && err !== null;
  const message = err instanceof Error ? err.message : String(err);
  const code = isObj && 'code' in err && typeof (err as Record<string, unknown>).code === 'string'
    ? ((err as Record<string, unknown>).code as string)
    : undefined;
  const command = isObj && 'command' in err && typeof (err as Record<string, unknown>).command === 'string'
    ? ((err as Record<string, unknown>).command as string)
    : undefined;
  const response = isObj && 'response' in err && typeof (err as Record<string, unknown>).response === 'string'
    ? ((err as Record<string, unknown>).response as string)
    : undefined;
  const responseCode = isObj && 'responseCode' in err && typeof (err as Record<string, unknown>).responseCode === 'number'
    ? ((err as Record<string, unknown>).responseCode as number)
    : undefined;

  let diagnostic = 'Unexpected mail delivery error.';
  const lowerMsg = message.toLowerCase();

  if (code === 'ENETUNREACH' || lowerMsg.includes('enetunreach') || lowerMsg.includes('network unreachable')) {
    diagnostic = `Network unreachable: Host environment has no outbound IPv6 route. Ensure IPv4 DNS resolution is prioritized (dns.setDefaultResultOrder('ipv4first')).`;
  } else if (code === 'ETIMEDOUT' || lowerMsg.includes('timeout')) {
    diagnostic = `Connection timeout reaching SMTP server at ${smtpHost}:${smtpPort}. Ensure port ${smtpPort} is not blocked by firewall or hosting provider.`;
  } else if (
    code === 'EAUTH' ||
    responseCode === 535 ||
    lowerMsg.includes('username and password not accepted') ||
    lowerMsg.includes('bad credentials')
  ) {
    diagnostic = `Authentication failed: Invalid credentials for ${smtpHost}. For Gmail, verify SMTP_USER and ensure SMTP_APP_PASSWORD is a valid 16-character Google App Password (not your primary password) generated with 2-Step Verification enabled.`;
  } else if (code === 'ECONNREFUSED' || lowerMsg.includes('connection refused')) {
    diagnostic = `Connection refused by SMTP server ${smtpHost}:${smtpPort}. Verify the host and port are correct and the service is accepting connections.`;
  } else if (code === 'ESOCKET' || lowerMsg.includes('ssl') || lowerMsg.includes('tls') || lowerMsg.includes('handshake')) {
    diagnostic = `SSL/TLS negotiation failure with ${smtpHost}:${smtpPort}. Check if SMTP_SECURE setting matches the port (typically port 465 uses secure=true, port 587 uses secure=false with STARTTLS).`;
  } else if (response) {
    diagnostic = `SMTP server rejected delivery: "${response}".`;
  }

  return {
    message,
    code,
    command,
    response,
    responseCode,
    diagnostic,
  };
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

    logger.info('email sent successfully via SMTP', {
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
    const details = diagnoseMailError(err, config.smtpHost, config.smtpPort);

    logger.error('failed to send email via SMTP', {
      to: options.to,
      subject: options.subject,
      attempt: options.attempt,
      error: details.message,
      code: details.code,
      command: details.command,
      responseCode: details.responseCode,
      response: details.response,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      durationMs,
      diagnosis: details.diagnostic,
    });

    // Fallback to MailerSend if configured and attempt threshold met (attempt >= 3 or direct send fallback)
    const shouldFallbackToMailerSend =
      Boolean(config.mailerSendKey) &&
      (options.attempt === undefined || options.attempt >= 3);

    if (shouldFallbackToMailerSend) {
      logger.info('Nodemailer SMTP failed, attempting delivery via MailerSend backup provider', {
        to: options.to,
        subject: options.subject,
        attempt: options.attempt,
        primaryError: details.message,
      });

      const mailerSendResult = await mailerSendClient.sendMailViaMailerSend(options);
      if (mailerSendResult.success) {
        return mailerSendResult;
      }
    }

    return {
      success: false,
      error: details.message,
      code: details.code,
      command: details.command,
      response: details.response,
      responseCode: details.responseCode,
      durationMs,
    };
  }
}

export const mailClient = {
  sendMail,
};


