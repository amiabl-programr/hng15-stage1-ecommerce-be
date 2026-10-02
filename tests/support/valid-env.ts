/**
 * A complete, deliberately non-placeholder environment for unit tests.
 *
 * Note the absence of anything derived from the developer's own machine: unit tests
 * must not pass on a laptop that happens to have a real `.env`. Anything that needs
 * a live key is an integration test and gets its own environment guard.
 */
export const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  APP_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-real-value',
  SUPABASE_SECRET_KEY: 'sb_secret_realkeyvalue0123456789',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_legacyservicekeyvalue',
  STORAGE_BUCKET: 'products',
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret-real-value',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/auth/callback/google',
  SESSION_TTL_DAYS: '7',
  BOOTSTRAP_ADMIN_EMAILS: '',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'sender@gmail.com',
  SMTP_APP_PASSWORD: 'abcd efgh ijkl mnop',
  MAIL_FROM: 'Shop <sender@gmail.com>',
  BUSINESS_EMAIL: 'support@roofingco.com',
  BUSINESS_PHONE: '+2348007663464',
} satisfies NodeJS.ProcessEnv;