import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { env } from '../../config/env.ts';

let transporterInstance: Transporter | null = null;

export function getMailTransporter(): Transporter {
  if (transporterInstance) {
    return transporterInstance;
  }

  const config = env();

  transporterInstance = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpAppPassword,
    },
  });

  return transporterInstance;
}

export function resetMailTransporter(): void {
  transporterInstance = null;
}
