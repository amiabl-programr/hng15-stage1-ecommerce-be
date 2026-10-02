import { redact } from '../../../src/lib/redact.ts';

describe('redact', () => {
  it('masks a supabase secret key', () => {
    expect(redact('key is sb_secret_abc123DEF456')).toBe('key is sb_secret_***');
  });

  it('masks a legacy jwt-shaped service role key', () => {
    const line = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';

    expect(redact(line)).not.toContain('dBjftJeZ4CVPmB92K27uhbUJU1p1r');
    expect(redact(line)).toBe('***');
  });

  it('masks an authorization header value', () => {
    expect(redact('Authorization: Bearer abc.def.ghi')).toBe('Authorization: ***');
    expect(redact('authorization=Bearer abc123')).toBe('authorization=***');
  });

  it('masks every credential in a database connection string', () => {
    const line = 'postgres://postgres.supabase:hunter2@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

    const output = redact(line);

    expect(output).not.toContain('hunter2');
    expect(output).toContain('pooler.supabase.com:6543/postgres');
  });

  it('masks a key that appears mid-line', () => {
    expect(redact('connect failed using sb_secret_zzzz')).toBe('connect failed using sb_secret_***');
  });

  it('leaves ordinary text intact', () => {
    expect(redact('order 4711 rejected: insufficient stock')).toBe(
      'order 4711 rejected: insufficient stock',
    );
  });
});