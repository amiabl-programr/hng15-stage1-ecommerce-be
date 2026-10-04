import { z } from 'zod';

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

const PLACEHOLDER_PATTERN = /(?:^|[^a-z0-9])(your|my|change[-_]?me|placeholder|example|dummy|xxx)/i;

function looksLikePlaceholder(value: string): boolean {
  return value.includes('...') || PLACEHOLDER_PATTERN.test(value);
}

const realValue = z
  .string()
  .min(1)
  .refine((value) => !looksLikePlaceholder(value), {
    message: 'looks like a placeholder value, not a real credential',
  });

const realUrl = z
  .string()
  .url()
  .refine((value) => !looksLikePlaceholder(value), {
    message: 'looks like a placeholder value, not a real url',
  });

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  SUPABASE_URL: realUrl.optional(),
  SUPABASE_DB_URL: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: realValue,
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().min(1).default('products'),
  GOOGLE_CLIENT_ID: realValue,
  GOOGLE_CLIENT_SECRET: realValue,
  GOOGLE_REDIRECT_URI: z.string().url(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(''),
  SMTP_HOST: z.string().min(1).default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString,
  SMTP_USER: realValue,
  SMTP_APP_PASSWORD: realValue,
  MAIL_FROM: z.string().min(1),
  MAILER_SEND_KEY: z.string().optional(),
  MAILERSEND_API_KEY: z.string().optional(),
  MAILER_SEND_FROM: z.string().optional(),
  MAILERSEND_FROM: z.string().optional(),
  BUSINESS_EMAIL: z.string().email(),
  BUSINESS_PHONE: z.string().min(1),
});

export type Env = {
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly isProduction: boolean;
  readonly port: number;
  readonly appUrl: URL;
  readonly corsOrigins: readonly string[];
  readonly supabaseUrl: URL;
  readonly supabaseAnonKey: string;
  readonly supabaseSecretKey: string;
  readonly storageBucket: string;
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly googleRedirectUri: URL;
  readonly sessionTtlDays: number;
  readonly bootstrapAdminEmails: readonly string[];
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly smtpSecure: boolean;
  readonly smtpUser: string;
  readonly smtpAppPassword: string;
  readonly mailFrom: string;
  readonly mailerSendKey?: string | undefined;
  readonly mailerSendFrom?: string | undefined;
  readonly businessEmail: string;
  readonly businessPhone: string;
};

function resolveSecretKey(parsed: z.infer<typeof rawEnvSchema>): string {
  const candidate =
    parsed.SUPABASE_SECRET_KEY ?? parsed.SUPABASE_SERVICE_ROLE_KEY ?? undefined;

  if (candidate === undefined || looksLikePlaceholder(candidate)) {
    throw new EnvValidationError(
      'SUPABASE_SECRET_KEY (sb_secret_...) is required. SUPABASE_SERVICE_ROLE_KEY is accepted as a legacy fallback. The API never falls back to the anon key — notes.md §4 records that doing so turns a boot crash into a runtime permission error.',
    );
  }

  return candidate;
}

/**
 * `db.<ref>.supabase.co` and `<ref>.supabase.co` are the same project behind two
 * doors, so a direct Postgres host is enough to find the API URL. A *pooler* host
 * is not: `aws-1-eu-west-3.pooler.supabase.com` carries no project ref, so it cannot
 * be inverted. Set SUPABASE_URL explicitly in that case — the dashboard has it under
 * Project Settings → Data API → Project URL.
 */
function deriveApiUrlFromDbUrl(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return undefined;
  }
  if (!url.hostname.startsWith('db.')) {
    return undefined;
  }

  return new URL(`https://${url.hostname.slice('db.'.length)}`);
}

function resolveSupabaseUrl(parsed: z.infer<typeof rawEnvSchema>): URL {
  if (parsed.SUPABASE_URL !== undefined) {
    return new URL(parsed.SUPABASE_URL);
  }

  const derived =
    parsed.SUPABASE_DB_URL === undefined ? undefined : deriveApiUrlFromDbUrl(parsed.SUPABASE_DB_URL);

  if (derived === undefined) {
    throw new EnvValidationError(
      'SUPABASE_URL is required and could not be derived. SUPABASE_DB_URL only reveals it when it is a direct host of the form db.<project-ref>.supabase.co; a pooler host does not. Set SUPABASE_URL to the Project URL from Project Settings → Data API, or copy this project\'s value: https://xkierkbfzyamuetgftzj.supabase.co',
    );
  }

  return derived;
}

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseRaw(source: NodeJS.ProcessEnv): z.infer<typeof rawEnvSchema> {
  const result = rawEnvSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  // Every problem in one line naming every variable, instead of a ZodError tree the
  // operator has to read to find the single name they got wrong.
  const summary = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

  throw new EnvValidationError(`Invalid environment — ${summary}`);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = parseRaw(source);
  const supabaseSecretKey = resolveSecretKey(parsed);

  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    port: parsed.PORT,
    appUrl: new URL(parsed.APP_URL),
    corsOrigins: splitList(parsed.CORS_ORIGINS),
    supabaseUrl: resolveSupabaseUrl(parsed),
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    supabaseSecretKey,
    storageBucket: parsed.STORAGE_BUCKET,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: new URL(parsed.GOOGLE_REDIRECT_URI),
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    bootstrapAdminEmails: splitList(parsed.BOOTSTRAP_ADMIN_EMAILS),
    smtpHost: parsed.SMTP_HOST,
    smtpPort: parsed.SMTP_PORT,
    smtpSecure: parsed.SMTP_SECURE,
    smtpUser: parsed.SMTP_USER,
    smtpAppPassword: parsed.SMTP_APP_PASSWORD,
    mailFrom: parsed.MAIL_FROM,
    mailerSendKey:
      (parsed.MAILER_SEND_KEY && !looksLikePlaceholder(parsed.MAILER_SEND_KEY)
        ? parsed.MAILER_SEND_KEY
        : parsed.MAILERSEND_API_KEY && !looksLikePlaceholder(parsed.MAILERSEND_API_KEY)
          ? parsed.MAILERSEND_API_KEY
          : undefined),
    mailerSendFrom:
      (parsed.MAILER_SEND_FROM && !looksLikePlaceholder(parsed.MAILER_SEND_FROM)
        ? parsed.MAILER_SEND_FROM
        : parsed.MAILERSEND_FROM && !looksLikePlaceholder(parsed.MAILERSEND_FROM)
          ? parsed.MAILERSEND_FROM
          : undefined),
    businessEmail: parsed.BUSINESS_EMAIL,
    businessPhone: parsed.BUSINESS_PHONE,
  };
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

export function _setEnvForTesting(overrides?: Partial<Env> | undefined): void {
  if (overrides) {
    cached = { ...loadEnv(), ...overrides };
  } else {
    cached = undefined;
  }
}