import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Manage-link tokens. The guest's link carries 32 random bytes; the diary
 * keeps only their SHA-256, so a leaked database row can't be turned back into
 * a working link.
 */

export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenMatches(token: unknown, storedHash: string | null): boolean {
  if (typeof token !== 'string' || !token || !storedHash) return false
  const given = Buffer.from(hashToken(token), 'hex')
  const want = Buffer.from(storedHash, 'hex')
  return given.length === want.length && timingSafeEqual(given, want)
}

/** Constant-time string comparison for shared secrets (the calendar feed). */
export function secretMatches(given: string, expected: string | undefined): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
