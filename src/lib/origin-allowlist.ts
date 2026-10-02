export function createOriginAllowlist(value: string): ReadonlySet<string> {
  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}