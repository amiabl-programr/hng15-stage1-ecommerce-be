import { redact } from './redact.ts';

export type LogFields = Readonly<Record<string, string | number | boolean | undefined>>;

function write(level: 'info' | 'error', message: string, fields: LogFields): void {
  const entries = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => [key, typeof value === 'string' ? redact(value) : value]);

  const line = JSON.stringify({
    level,
    message: redact(message),
    time: new Date().toISOString(),
    ...Object.fromEntries(entries),
  });

  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (message: string, fields: LogFields = {}): void => write('info', message, fields),
  error: (message: string, fields: LogFields = {}): void => write('error', message, fields),
};