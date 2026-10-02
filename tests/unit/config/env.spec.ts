import { EnvValidationError, loadEnv } from '../../../src/config/env.ts';
import { validEnv as valid } from '../../support/valid-env.ts';

describe('loadEnv', () => {
  it('parses a complete environment', () => {
    const parsed = loadEnv(valid);

    expect(parsed.supabaseSecretKey).toBe('sb_secret_realkeyvalue0123456789');
    expect(parsed.corsOrigins).toEqual(['http://localhost:3000']);
    expect(parsed.bootstrapAdminEmails).toEqual([]);
  });

  it('coerces a string port to a number', () => {
    expect(loadEnv({ ...valid, PORT: '8080' }).port).toBe(8080);
  });

  it('coerces SMTP_SECURE=false to boolean false rather than the string', () => {
    const parsed = loadEnv({ ...valid, SMTP_SECURE: 'false' });

    expect(parsed.smtpSecure).toBe(false);
    expect(typeof parsed.smtpSecure).toBe('boolean');
  });

  it('coerces SMTP_SECURE=true to boolean true', () => {
    expect(loadEnv({ ...valid, SMTP_SECURE: 'true' }).smtpSecure).toBe(true);
  });

  it('applies documented defaults', () => {
    const parsed = loadEnv(valid);

    expect(parsed.port).toBe(4000);
    expect(parsed.storageBucket).toBe('products');
    expect(parsed.sessionTtlDays).toBe(7);
    expect(parsed.smtpHost).toBe('smtp.gmail.com');
    expect(parsed.smtpPort).toBe(587);
    expect(parsed.isProduction).toBe(false);
  });

  it('splits comma-separated lists and drops blanks', () => {
    const parsed = loadEnv({
      ...valid,
      CORS_ORIGINS: 'http://localhost:3000, https://roofingco.com ,,',
      BOOTSTRAP_ADMIN_EMAILS: 'owner@roofingco.com, admin@roofingco.com',
    });

    expect(parsed.corsOrigins).toEqual(['http://localhost:3000', 'https://roofingco.com']);
    expect(parsed.bootstrapAdminEmails).toEqual([
      'owner@roofingco.com',
      'admin@roofingco.com',
    ]);
  });

  it('parses urls into URL instances', () => {
    const parsed = loadEnv(valid);

    expect(parsed.appUrl.hostname).toBe('localhost');
    expect(parsed.supabaseUrl.hostname).toBe('project.supabase.co');
    expect(parsed.googleRedirectUri.pathname).toBe('/api/auth/callback/google');
  });
});

describe('secret key resolution', () => {
  it('throws when neither secret key is present', () => {
    const { SUPABASE_SECRET_KEY: _s, SUPABASE_SERVICE_ROLE_KEY: _l, ...withoutKeys } = valid;

    expect(() => loadEnv(withoutKeys)).toThrow(EnvValidationError);
    expect(() => loadEnv(withoutKeys)).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it('never falls back to the anon key', () => {
    const {
      SUPABASE_SECRET_KEY: _s,
      SUPABASE_SERVICE_ROLE_KEY: _l,
      ...withoutSecretKeys
    } = valid;

    // The anon key is present and valid; it must not be promoted to the secret.
    expect(() => loadEnv(withoutSecretKeys)).toThrow(EnvValidationError);
  });

  it('accepts the legacy service role key as a fallback', () => {
    const { SUPABASE_SECRET_KEY: _s, ...withoutSecret } = valid;

    const parsed = loadEnv({
      ...withoutSecret,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_legacyservicekey',
    });

    expect(parsed.supabaseSecretKey).toBe('sb_secret_legacyservicekey');
  });

  it('prefers SUPABASE_SECRET_KEY when both are present', () => {
    const parsed = loadEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_legacy' });

    expect(parsed.supabaseSecretKey).toBe('sb_secret_realkeyvalue0123456789');
  });

  it('rejects a placeholder secret key', () => {
    expect(() => loadEnv({ ...valid, SUPABASE_SECRET_KEY: 'sb_secret_...' })).toThrow(
      EnvValidationError,
    );
  });
});

describe('supabase url resolution', () => {
  it('uses SUPABASE_URL when it is set', () => {
    const parsed = loadEnv({
      ...valid,
      SUPABASE_URL: 'https://explicit.supabase.co',
      SUPABASE_DB_URL: 'postgresql://postgres@db.otherref.supabase.co:5432/postgres',
    });

    expect(parsed.supabaseUrl.hostname).toBe('explicit.supabase.co');
  });

  it('derives the api url from a direct db.<ref> host', () => {
    const { SUPABASE_URL: _u, ...withoutUrl } = valid;

    const parsed = loadEnv({
      ...withoutUrl,
      SUPABASE_DB_URL: 'postgresql://postgres:pw@db.xkierkbfzyamuetgftzj.supabase.co:5432/postgres',
    });

    expect(parsed.supabaseUrl.toString()).toBe('https://xkierkbfzyamuetgftzj.supabase.co/');
  });

  it('cannot derive from a pooler host, and says where to get it', () => {
    const { SUPABASE_URL: _u, ...withoutUrl } = valid;

    expect(() =>
      loadEnv({
        ...withoutUrl,
        SUPABASE_DB_URL:
          'postgresql://postgres.xkierkbfzyamuetgftzj:pw@aws-1-eu-west-3.pooler.supabase.com:5432/postgres',
      }),
    ).toThrow(/SUPABASE_URL is required and could not be derived/);
  });

  it('cannot derive when neither variable is set', () => {
    const { SUPABASE_URL: _u, ...withoutUrl } = valid;

    expect(() => loadEnv(withoutUrl)).toThrow(/SUPABASE_URL is required/);
  });

  it('rejects a placeholder SUPABASE_URL rather than booting against a fake project', () => {
    expect(() => loadEnv({ ...valid, SUPABASE_URL: 'https://your-project-ref.supabase.co' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects a malformed SUPABASE_URL', () => {
    expect(() => loadEnv({ ...valid, SUPABASE_URL: 'not a url' })).toThrow(EnvValidationError);
  });
});

describe('boot error readability', () => {
  it('names every missing variable in a single EnvValidationError', () => {
    const errors = collectIssues({ ...valid, APP_URL: undefined, CORS_ORIGINS: undefined });

    expect(errors.join(' | ')).toContain('APP_URL');
    expect(errors.join(' | ')).toContain('CORS_ORIGINS');
    expect(errors).toHaveLength(2);
  });

  it('says which value is a placeholder, and which variable holds it', () => {
    const errors = collectIssues({ ...valid, GOOGLE_CLIENT_ID: 'your-client-id' });

    expect(errors.join(' ')).toContain('GOOGLE_CLIENT_ID');
    expect(errors.join(' ')).toContain('placeholder');
  });

  it('never leaks a credential value into the message', () => {
    const errors = collectIssues({ ...valid, SUPABASE_ANON_KEY: 'your-anon-key' });

    expect(errors.join(' ')).not.toContain('your-anon-key');
  });
});

function collectIssues(source: NodeJS.ProcessEnv): string[] {
  try {
    loadEnv(source);
  } catch (error) {
    return (error as Error).message.split('; ');
  }
  throw new Error('expected loadEnv to throw');
}

describe('placeholder rejection', () => {
  const placeholders = [
    'your-anon-key',
    'your-client-id.apps.googleusercontent.com',
    'your-client-secret',
    'sb_secret_...',
    'xxxx xxxx xxxx xxxx',
    'changeme',
  ];

  it.each(placeholders)('rejects %s', (value) => {
    expect(() => loadEnv({ ...valid, SUPABASE_ANON_KEY: value })).toThrow();
    expect(() => loadEnv({ ...valid, GOOGLE_CLIENT_SECRET: value })).toThrow();
  });
});

describe('required values', () => {
  it('rejects a non-url APP_URL', () => {
    expect(() => loadEnv({ ...valid, APP_URL: 'not a url' })).toThrow();
  });

  it('rejects a malformed BUSINESS_EMAIL', () => {
    expect(() => loadEnv({ ...valid, BUSINESS_EMAIL: 'nope' })).toThrow();
  });

  it('rejects a missing CORS_ORIGINS', () => {
    const { CORS_ORIGINS: _c, ...withoutOrigins } = valid;

    expect(() => loadEnv(withoutOrigins)).toThrow();
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'staging' })).toThrow();
  });
});