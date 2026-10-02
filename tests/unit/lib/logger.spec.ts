import { jest } from '@jest/globals';

import { logger } from '../../../src/lib/logger.ts';

function capture(impl: 'log' | 'error', run: () => void): unknown[] {
  const lines: unknown[] = [];
  const spy = jest.spyOn(console, impl).mockImplementation((line: unknown) => {
    lines.push(line);
  });

  try {
    run();
  } finally {
    spy.mockRestore();
  }

  return lines;
}

describe('logger', () => {
  it('writes one json object per line', () => {
    const lines = capture('log', () => logger.info('api listening', { port: 4000 }));

    expect(lines).toHaveLength(1);
    expect(typeof lines[0]).toBe('string');
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      level: 'info',
      message: 'api listening',
      port: 4000,
    });
  });

  it('tags error lines and writes them to stderr', () => {
    const lines = capture('error', () => logger.error('request failed', { status: 500 }));

    expect(JSON.parse(lines[0] as string)).toMatchObject({
      level: 'error',
      message: 'request failed',
      status: 500,
    });
  });

  it('stamps an ISO timestamp', () => {
    const line = capture('log', () => logger.info('hello'))[0] as string;

    expect(Number.isNaN(Date.parse(JSON.parse(line).time))).toBe(false);
  });

  it('redacts string field values', () => {
    const line = capture('error', () =>
      logger.error('auth failed', { cause: 'token sb_secret_leaked was rejected' }),
    )[0] as string;

    expect(line).not.toContain('sb_secret_leaked');
    expect(line).toContain('sb_secret_***');
  });

  it('redacts the message itself', () => {
    const line = capture('error', () => logger.error('bad key sb_secret_oops'))[0] as string;

    expect(line).not.toContain('sb_secret_oops');
  });

  it('keeps non-string field values readable', () => {
    const line = capture('log', () => logger.info('stock', { quantity: 3, ok: true }))[0] as string;

    expect(JSON.parse(line)).toMatchObject({ quantity: 3, ok: true });
  });

  it('omits undefined fields rather than emitting nulls', () => {
    const line = capture('log', () => logger.info('m', { a: undefined, b: 'kept' }))[0] as string;

    expect(JSON.parse(line)).not.toHaveProperty('a');
    expect(JSON.parse(line)).toMatchObject({ b: 'kept' });
  });
});