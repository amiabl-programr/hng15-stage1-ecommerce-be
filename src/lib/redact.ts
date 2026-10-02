const SECRET_KEY_PATTERN = /\bsb_secret_[A-Za-z0-9_-]+/g;
const LEGACY_SERVICE_KEY_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /\b(Authorization\s*[:=]\s*)(Bearer\s+)?\S+/gi;
const URL_USERINFO_PATTERN = /(\/\/[^:/@\s"']+:)[^@\s"/]+@/g;
const URL_CREDENTIALS_PATTERN = /(\b[a-z_]+=)[^&\s"']+/gi;

/**
 * Supabase secret keys are JWT-shaped, so they cannot be distinguished from an
 * anonymous key by pattern alone. Rather than trying, everything that looks like a
 * credential is masked. Over-redacting a log line costs nothing; under-redacting one
 * puts a live key in a log aggregator.
 */
export function redact(value: string): string {
  return value
    .replace(SECRET_KEY_PATTERN, 'sb_secret_***')
    .replace(LEGACY_SERVICE_KEY_PATTERN, '***')
    .replace(BEARER_PATTERN, '$1***')
    .replace(URL_USERINFO_PATTERN, '$1***@')
    .replace(URL_CREDENTIALS_PATTERN, '$1***');
}