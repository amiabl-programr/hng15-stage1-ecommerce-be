import dns from 'node:dns';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import { env } from '../../config/env.ts';

// Force Node DNS resolver to return IPv4 addresses first.
// Cloud environments like Render do not have outbound IPv6 routing,
// causing connections to smtp.gmail.com (which advertises AAAA records)
// to fail with ENETUNREACH or hang until timeout.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore in runtimes where setDefaultResultOrder is not available
}

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
