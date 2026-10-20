import type { TenantConfig } from '../../config/tenant.ts'
import type { Block, Booking } from '../types.ts'
import {
  checkBlock,
  checkBooking,
  checkDetails,
  freeStarts,
  guestCanChange,
  LIMITS,
  serviceById,
  spanOf,
  TAKEN_MESSAGE,
  type Context,
  type Details,
} from '../rules.ts'
import { at, minutesOf, shiftDays } from '../time.ts'
import { bookingIcs } from '../ics.ts'
import {
  clearAttempts,
  clearedCookie,
  isOwner,
  issueSession,
  ownerAuth,
  recordAttempt,
  sessionCookie,
  tooManyAttempts,
  verifyPassword,
} from './auth.ts'
import { notify } from './email.ts'
import { SlotTaken, type BookingStore } from './store.ts'
import { newManageToken, tokenMatches } from './tokens.ts'
import { tenantConfig, type Config } from './config.ts'

/**
 * The booking API, written against plain request/response shapes; the Next
 * route adapts to and from these, so every handler is testable without a
 * server.
 *
 * What a stranger can read: free start times, and nothing else. A guest with
 * a valid manage token can read and change their own booking. Everything
 * else needs the owner's session. Every write re-runs the rules inside the
 * store's lock, against the server's clock taken inside that lock.
 */

export type ApiRequest = {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  ip: string
  cookie?: string
  contentType?: string
  /** The site's own origin, for links in emails and responses. */
  origin: string
  secure: boolean
}

export type ApiResponse = {
  status: number
  body?: unknown
  /** A non-JSON body (the .ics). */
  raw?: string
  headers?: Record<string, string>
}

const json = (status: number, body?: unknown, headers?: Record<string, string>): ApiResponse => ({ status, body, headers })
const fail = (status: number, error: string, code?: string) => json(status, { error, ...(code ? { code } : {}) })

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Bookings and blocks around a day — enough for any check on it. */
async function contextAround(
  store: BookingStore,
  start: Date,
  now: Date,
  extra: Partial<Context> = {},
): Promise<Context> {
  const range = {
    from: new Date(start.getTime() - 36 * 3_600_000).toISOString(),
    to: new Date(start.getTime() + 36 * 3_600_000).toISOString(),
  }
  const [bookings, blocks] = await Promise.all([store.listBookings(range), store.listBlocks(range)])
  return { bookings, blocks, now, ...extra }
}

/** What a guest sees of their own booking. */
export type GuestBooking = {
  id: string
  serviceId: string
  serviceName: string
  startsAt: string
  endsAt: string
  priceCents: number
  status: Booking['status']
  name: string
  canChange: boolean
}

export function guestView(b: Booking, now: Date, cfg: TenantConfig): GuestBooking {
  return {
    id: b.id,
    serviceId: b.serviceId,
    serviceName: serviceById(b.serviceId, cfg)?.name ?? 'Appointment',
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    priceCents: b.priceCentsSnapshot,
    status: b.status,
    name: b.customer.name,
    canChange: guestCanChange(b, now, cfg),
  }
}

/** The booking, only if the token is its own. A wrong token and a missing booking look the same. */
export async function guestBooking(store: BookingStore, id: string, token: unknown): Promise<Booking | null> {
  if (!UUID.test(id)) return null
  const b = await store.getBooking(id)
  return b && tokenMatches(token, b.manageTokenHash) ? b : null
}

const manageUrl = (origin: string, id: string, token: string) => `${origin}/booking/${id}?t=${encodeURIComponent(token)}`
const icsUrl = (origin: string, id: string, token: string) =>
  `${origin}/api/booking/bookings/${id}/ics?t=${encodeURIComponent(token)}`

/** Shared by the guest and the owner: rules, then the write, under the lock. */
async function create(
  config: Config,
  cfg: TenantConfig,
  input: { serviceId?: unknown; startsAt?: unknown },
  details: Details,
  actor: 'guest' | 'owner',
): Promise<{ res: ApiResponse; booking?: Booking; token?: string }> {
  const { store } = config
  const serviceId = String(input.serviceId ?? '')
  const startsAt = String(input.startsAt ?? '')

  return store.exclusive(async () => {
    const now = new Date()
    const start = new Date(startsAt)
    if (Number.isNaN(start.getTime())) return { res: fail(400, 'That is not a valid time.', 'bad-time') }
    const ctx = await contextAround(store, start, now, { actor })
    const violation = checkBooking({ serviceId, startsAt }, ctx, cfg)
    if (violation) return { res: fail(409, violation.message, violation.code) }

    const service = serviceById(serviceId, cfg)!
    const span = spanOf(start, service, cfg)
    const { token, hash } = newManageToken()
    const stamp = now.toISOString()
    const booking: Booking = {
      id: crypto.randomUUID(),
      serviceId,
      startsAt: span.start.toISOString(),
      endsAt: span.end.toISOString(),
      blockedUntil: span.blockedUntil.toISOString(),
      // Never from the request: a client cannot talk itself into another status or price.
      status: 'confirmed',
      priceCentsSnapshot: service.priceCents,
      customer: { name: details.name, phone: details.phone, email: details.email },
      notes: details.notes,
      source: actor === 'owner' ? 'owner' : 'web',
      manageTokenHash: hash,
      createdAt: stamp,
      updatedAt: stamp,
      cancelledAt: null,
    }
    try {
      await store.insertBooking(booking)
    } catch (e) {
      if (e instanceof SlotTaken) return { res: fail(409, TAKEN_MESSAGE, 'taken') }
      throw e
    }
    return { res: json(201, {}), booking, token }
  })
}

export async function handle(req: ApiRequest, config: Config): Promise<ApiResponse> {
  const { store } = config
  // Services, hours, closures and rules as Vance has them set right now.
  const cfg = await tenantConfig(store)
  const parts = req.path.split('/').filter(Boolean)
  const body = (req.body ?? {}) as Record<string, unknown>
  const mutating = req.method !== 'GET' && req.method !== 'HEAD'

  // A cross-site form can't send JSON without a preflight we never answer.
  if (mutating && !(req.contentType ?? '').startsWith('application/json')) {
    return fail(415, 'Send JSON.')
  }

  // --- public: free start times ---------------------------------------------
  if (parts[0] === 'availability' && parts.length === 1 && req.method === 'GET') {
    const date = req.query.date ?? ''
    const service = serviceById(req.query.service ?? '', cfg)
    if (!DATE.test(date)) return fail(400, 'A date in YYYY-MM-DD form is required.')
    if (!service) return fail(400, 'Choose a service.')
    const now = new Date()
    const ctx = await contextAround(store, at(date, '12:00'), now)
    const starts = freeStarts(date, service, ctx, cfg).map((d) => d.toISOString())
    return json(200, { date, serviceId: service.id, starts }, { 'Cache-Control': 'no-store' })
  }

  // --- guests ---------------------------------------------------------------
  if (parts[0] === 'bookings') {
    if (parts.length === 1 && req.method === 'POST') {
      const checked = checkDetails(body, { requireEmail: true })
      if (!checked.ok) return fail(400, checked.violation.message, checked.violation.code)
      const out = await create(config, cfg, body, checked.details, 'guest')
      if (!out.booking || !out.token) return out.res
      const link = manageUrl(config.siteUrl ?? req.origin, out.booking.id, out.token)
      await notify(config.mailer, 'created', out.booking, { cfg, siteUrl: config.siteUrl, manageUrl: link, ownerEmail: config.ownerEmail })
      return json(201, {
        booking: guestView(out.booking, new Date(), cfg),
        manageUrl: link,
        icsUrl: icsUrl(config.siteUrl ?? req.origin, out.booking.id, out.token),
      })
    }

    const id = parts[1] ?? ''
    const token = req.method === 'GET' ? req.query.t : body.t

    if (parts.length === 2 && req.method === 'GET') {
      const b = await guestBooking(store, id, token)
      return b ? json(200, guestView(b, new Date(), cfg)) : fail(404, 'No booking matches that link.')
    }

    if (parts.length === 3 && parts[2] === 'ics' && req.method === 'GET') {
      const b = await guestBooking(store, id, token)
      if (!b) return fail(404, 'No booking matches that link.')
      return {
        status: 200,
        raw: bookingIcs(b),
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="${cfg.slug}-booking.ics"`,
          'Cache-Control': 'no-store',
        },
      }
    }

    if (parts.length === 3 && parts[2] === 'cancel' && req.method === 'POST') {
      const out = await store.exclusive(async () => {
        const now = new Date()
        const b = await guestBooking(store, id, token)
        if (!b) return { res: fail(404, 'No booking matches that link.') }
        if (b.status !== 'confirmed') return { res: fail(409, 'This booking is already cancelled.', 'not-confirmed') }
        if (!guestCanChange(b, now, cfg)) {
          return {
            res: fail(
              403,
              `This booking is less than ${cfg.rules.guestChangeCutoffHours} hours away, so it can’t be changed online. Contact @${cfg.instagram} on Instagram.`,
              'cutoff',
            ),
          }
        }
        const cancelled: Booking = { ...b, status: 'cancelled', cancelledAt: now.toISOString(), updatedAt: now.toISOString() }
        await store.updateBooking(cancelled)
        return { res: json(200, guestView(cancelled, now, cfg)), booking: cancelled }
      })
      if (out.booking) await notify(config.mailer, 'cancelled-by-guest', out.booking, { cfg, siteUrl: config.siteUrl, ownerEmail: config.ownerEmail })
      return out.res
    }

    if (parts.length === 3 && parts[2] === 'reschedule' && req.method === 'POST') {
      const startsAt = String(body.startsAt ?? '')
      const out = await store.exclusive(async () => {
        const now = new Date()
        const b = await guestBooking(store, id, token)
        if (!b) return { res: fail(404, 'No booking matches that link.') }
        if (b.status !== 'confirmed') return { res: fail(409, 'This booking is cancelled.', 'not-confirmed') }
        if (!guestCanChange(b, now, cfg)) {
          return {
            res: fail(
              403,
              `This booking is less than ${cfg.rules.guestChangeCutoffHours} hours away, so it can’t be changed online. Contact @${cfg.instagram} on Instagram.`,
              'cutoff',
            ),
          }
        }
        const start = new Date(startsAt)
        if (Number.isNaN(start.getTime())) return { res: fail(400, 'That is not a valid time.', 'bad-time') }
        const ctx = await contextAround(store, start, now, { ignoreId: b.id })
        const violation = checkBooking({ serviceId: b.serviceId, startsAt }, ctx, cfg)
        if (violation) return { res: fail(409, violation.message, violation.code) }
        const span = spanOf(start, serviceById(b.serviceId, cfg)!, cfg)
        const moved: Booking = {
          ...b,
          startsAt: span.start.toISOString(),
          endsAt: span.end.toISOString(),
          blockedUntil: span.blockedUntil.toISOString(),
          updatedAt: now.toISOString(),
        }
        try {
          await store.updateBooking(moved)
        } catch (e) {
          if (e instanceof SlotTaken) return { res: fail(409, TAKEN_MESSAGE, 'taken') }
          throw e
        }
        return { res: json(200, guestView(moved, now, cfg)), booking: moved }
      })
      if (out.booking) {
        await notify(config.mailer, 'rescheduled', out.booking, { cfg, siteUrl: config.siteUrl,
          manageUrl: manageUrl(config.siteUrl ?? req.origin, out.booking.id, String(token)),
          ownerEmail: config.ownerEmail,
        })
      }
      return out.res
    }

    return fail(404, 'No such endpoint.')
  }

  // --- owner ----------------------------------------------------------------
  if (parts[0] === 'owner') {
    const auth = ownerAuth()
    if (!auth || !auth.passwordHash) {
      return fail(503, 'Owner sign-in is not configured. Set OWNER_PASSWORD_HASH and SESSION_SECRET.', 'not-configured')
    }

    if (parts[1] === 'session') {
      if (req.method === 'POST') {
        if (tooManyAttempts(req.ip)) return fail(429, 'Too many attempts. Try again in 15 minutes.')
        const password = typeof body.password === 'string' ? body.password : ''
        if (!verifyPassword(password, auth.passwordHash)) {
          recordAttempt(req.ip)
          return fail(401, 'That password is not right.')
        }
        clearAttempts(req.ip)
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(issueSession(auth.secret), req.secure) })
      }
      if (req.method === 'DELETE') return json(200, { ok: true }, { 'Set-Cookie': clearedCookie(req.secure) })
      return fail(405, 'Method not allowed.')
    }

    if (!isOwner(req.cookie)) return fail(401, 'Sign in first.')

    if (parts[1] === 'diary' && req.method === 'GET') {
      const from = req.query.from ?? ''
      const to = req.query.to ?? ''
      if (!DATE.test(from) || !DATE.test(to) || to < from || to > shiftDays(from, 31)) {
        return fail(400, 'from and to must be dates, at most a month apart.')
      }
      const range = { from: at(from, '00:00').toISOString(), to: at(shiftDays(to, 1), '00:00').toISOString() }
      const [bookings, blocks] = await Promise.all([store.listBookings(range), store.listBlocks(range)])
      const byStart = (a: { startsAt: string }, b: { startsAt: string }) => a.startsAt.localeCompare(b.startsAt)
      // The owner's own diary: contact details included, the token hash not.
      const safe = bookings.sort(byStart).map(({ manageTokenHash: _hash, ...b }) => b)
      return json(200, { bookings: safe, blocks: blocks.sort(byStart) }, { 'Cache-Control': 'no-store' })
    }

    if (parts[1] === 'bookings' && parts.length === 2 && req.method === 'POST') {
      const checked = checkDetails(body, { requireEmail: false })
      if (!checked.ok) return fail(400, checked.violation.message, checked.violation.code)
      const out = await create(config, cfg, body, checked.details, 'owner')
      if (!out.booking || !out.token) return out.res
      const link = manageUrl(config.siteUrl ?? req.origin, out.booking.id, out.token)
      // The customer gets a confirmation if the owner took an email; Vance needs no alert for his own booking.
      await notify(config.mailer, 'created', out.booking, { cfg, siteUrl: config.siteUrl, manageUrl: link })
      return json(201, { id: out.booking.id })
    }

    if (parts[1] === 'bookings' && parts.length === 4 && parts[3] === 'cancel' && req.method === 'POST') {
      const id = parts[2]
      if (!UUID.test(id)) return fail(404, 'No such booking.')
      const out = await store.exclusive(async () => {
        const b = await store.getBooking(id)
        if (!b) return { res: fail(404, 'No such booking.') }
        if (b.status !== 'confirmed') return { res: fail(409, 'That booking is not confirmed.') }
        const now = new Date().toISOString()
        const cancelled: Booking = { ...b, status: 'cancelled', cancelledAt: now, updatedAt: now }
        await store.updateBooking(cancelled)
        return { res: json(200, { ok: true }), booking: cancelled }
      })
      if (out.booking) await notify(config.mailer, 'cancelled-by-owner', out.booking, { cfg, siteUrl: config.siteUrl })
      return out.res
    }

    if (parts[1] === 'blocks' && parts.length === 2 && req.method === 'POST') {
      const date = String(body.date ?? '')
      const from = String(body.from ?? '')
      const to = String(body.to ?? '')
      if (!DATE.test(date) || !TIME.test(from) || !TIME.test(to) || minutesOf(to) <= minutesOf(from)) {
        return fail(400, 'A block needs a date, and a start before its end.')
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, LIMITS.reason) || null : null
      const block: Block = {
        id: crypto.randomUUID(),
        startsAt: at(date, from).toISOString(),
        endsAt: at(date, to).toISOString(),
        reason,
      }
      return store.exclusive(async () => {
        const ctx = await contextAround(store, new Date(block.startsAt), new Date())
        const violation = checkBlock(block, ctx.bookings)
        if (violation) return fail(409, violation.message, violation.code)
        await store.insertBlock(block)
        return json(201, block)
      })
    }

    if (parts[1] === 'blocks' && parts.length === 3 && req.method === 'DELETE') {
      if (!UUID.test(parts[2])) return fail(404, 'No such block.')
      await store.deleteBlock(parts[2])
      return json(200, { ok: true })
    }

    return fail(404, 'No such endpoint.')
  }

  return fail(404, 'No such endpoint.')
}
