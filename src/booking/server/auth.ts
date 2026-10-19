import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Owner sign-in, ported from The Peacock's console (removed there in e968603,
 * when the Peregrine portal took over; this is the stopgap until it does here).
 *
 * The password never reaches the browser: only a scrypt hash lives in the
 * environment, and the browser gets an HMAC-signed token in an HttpOnly cookie
 * it can neither read nor forge. There are no default credentials. In
 * production, owner routes refuse to work until both OWNER_PASSWORD_HASH and
 * SESSION_SECRET are set.
 */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const COOKIE = 'vb_owner'

const b64 = (b: Buffer) => b.toString('base64url')

// --- configuration ----------------------------------------------------------

export type OwnerAuth = { passwordHash: string | null; secret: string }

// Outside production only, a missing secret is replaced per process: sessions
// then end on restart, which is harmless locally.
const devSecret = b64(randomBytes(32))

/** Null when owner sign-in must refuse to work at all. */
export function ownerAuth(env: NodeJS.ProcessEnv = process.env): OwnerAuth | null {
  const passwordHash = env.OWNER_PASSWORD_HASH || null
  const secret = env.SESSION_SECRET || null
  if (env.NODE_ENV === 'production' && (!passwordHash || !secret)) return null
  return { passwordHash, secret: secret ?? devSecret }
}

// --- password ---------------------------------------------------------------

/** `scrypt$N$r$p$salt$hash`, all base64url. Produced by `npm run hash-password`. */
export function hashPassword(password: string, N = 16384, r = 8, p = 1): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32, { N, r, p })
  return ['scrypt', N, r, p, b64(salt), b64(hash)].join('$')
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, salt, expected] = parts
  try {
    const actual = scryptSync(password, Buffer.from(salt, 'base64url'), 32, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    })
    const want = Buffer.from(expected, 'base64url')
    return actual.length === want.length && timingSafeEqual(actual, want)
  } catch {
    return false
  }
}

// --- session token ----------------------------------------------------------

type Claims = { role: 'owner'; issued: number }

export function issueSession(secret: string, now = Date.now()): string {
  const claims: Claims = { role: 'owner', issued: now }
  const body = b64(Buffer.from(JSON.stringify(claims)))
  const sig = b64(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

export function readSession(token: string | undefined, secret: string, now = Date.now()): Claims | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Claims
    if (claims.role !== 'owner') return null
    if (now - claims.issued > SESSION_TTL_MS || claims.issued > now + 60_000) return null
    return claims
  } catch {
    return null
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  const bits = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_MS / 1000}`]
  if (secure) bits.push('Secure')
  return bits.join('; ')
}

export function clearedCookie(secure: boolean): string {
  const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0']
  if (secure) bits.push('Secure')
  return bits.join('; ')
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

/** Is the request carrying a valid owner session? */
export function isOwner(cookieHeader: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const auth = ownerAuth(env)
  if (!auth || !auth.passwordHash) return false
  return readSession(readCookie(cookieHeader, COOKIE), auth.secret) !== null
}

// --- sign-in throttling -----------------------------------------------------

const attempts = new Map<string, { count: number; until: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

/**
 * Per-instance, so on serverless it is a speed bump rather than a lock. Enough
 * to stop one host being trivially brute-forced.
 */
export function tooManyAttempts(ip: string, now = Date.now()): boolean {
  const seen = attempts.get(ip)
  if (!seen || now > seen.until) return false
  return seen.count >= MAX_ATTEMPTS
}

export function recordAttempt(ip: string, now = Date.now()) {
  const seen = attempts.get(ip)
  if (!seen || now > seen.until) attempts.set(ip, { count: 1, until: now + WINDOW_MS })
  else seen.count++
}

export function clearAttempts(ip: string) {
  attempts.delete(ip)
}
