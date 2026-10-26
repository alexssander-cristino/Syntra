const MAX_POSTGRES_BIGINT = 9223372036854775807n;

export function isPositiveDatabaseId(value) {
  const text = String(value ?? '');
  if (!/^\d{1,19}$/.test(text)) return false;
  try {
    const id = BigInt(text);
    return id > 0n && id <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}
