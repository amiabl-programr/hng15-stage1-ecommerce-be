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

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  SUPABASE_URL: z.string().url(),
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

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = rawEnvSchema.parse(source);
  const supabaseSecretKey = resolveSecretKey(parsed);

  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    port: parsed.PORT,
    appUrl: new URL(parsed.APP_URL),
    corsOrigins: splitList(parsed.CORS_ORIGINS),
    supabaseUrl: new URL(parsed.SUPABASE_URL),
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
    businessEmail: parsed.BUSINESS_EMAIL,
    businessPhone: parsed.BUSINESS_PHONE,
  };
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}