import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import { env } from '../../config/env.ts';

let transporterInstance: Transporter | null = null;

export function getMailTransporter(): Transporter {
  if (transporterInstance) {
    return transporterInstance;
  }

  const config = env();

  const options: SMTPTransport.Options = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpAppPassword,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };

  transporterInstance = nodemailer.createTransport(options);

  return transporterInstance;
}

export function resetMailTransporter(): void {
  transporterInstance = null;
}
