import { tenant, type DateKey, type Service, type TenantConfig } from '../config/tenant.ts'
import type { Block, Booking } from './types.ts'
import { addMinutes, at, shiftDays, shopDateKey, todayKey, weekdayOf } from './time.ts'

/**
 * Every booking rule, written once.
 *
 * The browser runs these to offer only times that will be accepted; the
 * server runs them again inside every write, against its own clock and the
 * diary as it stands at that moment. Only the server's answer counts.
 *
 * Every function takes the tenant config last, defaulting to V Barbers, so
 * tests can exercise a rule against hours the shop doesn't keep (a Sunday on a
 * daylight-saving change, say).
 */

export type ViolationCode =
  | 'bad-service'
  | 'bad-time'
  | 'past'
  | 'too-soon'
  | 'too-far'
  | 'closed'
  | 'outside-hours'
  | 'after-close'
  | 'blocked'
  | 'taken'
  | 'bad-field'

export type Violation = { code: ViolationCode; message: string }

/** The diary a candidate is checked against, and whose clock. */
export type Context = {
  bookings: Booking[]
  blocks: Block[]
  now: Date
  /** The booking being rescheduled, so it doesn't clash with itself. */
  ignoreId?: string
  /** The owner may book inside the notice period and beyond the advance window. */
  actor?: 'guest' | 'owner'
}

export const TAKEN_MESSAGE = 'That time has just been taken. Please choose another.'

export function serviceById(id: string, cfg: TenantConfig = tenant): Service | undefined {
  return cfg.services.find((s) => s.id === id)
}

/** The shop's hours on a date — override first, then the weekly pattern. Null when closed. */
export function openingOn(key: DateKey, cfg: TenantConfig = tenant): { open: string; close: string } | null {
  const override = cfg.overrides.find((o) => o.date === key)
  if (override) {
    if (override.closed || !override.open || !override.close) return null
    return { open: override.open, close: override.close }
  }
  const hours = cfg.weeklyHours[weekdayOf(key)]
  return hours ? { open: hours[0], close: hours[1] } : null
}

/** The instants a booking of this service starting here occupies. */
export function spanOf(start: Date, service: Service, cfg: TenantConfig = tenant) {
  const end = addMinutes(start, service.durationMin)
  return { start, end, blockedUntil: addMinutes(end, cfg.rules.bufferMinutes) }
}

/** The last day a guest may book: today plus the advance window. */
export function lastBookableDay(now: Date, cfg: TenantConfig = tenant): DateKey {
  return shiftDays(todayKey(now), cfg.rules.maxAdvanceDays)
}

/** Every date from today to the end of the advance window, open or not. */
export function bookingWindow(now: Date, cfg: TenantConfig = tenant): DateKey[] {
  const out: DateKey[] = []
  const last = lastBookableDay(now, cfg)
  for (let k = todayKey(now); k <= last; k = shiftDays(k, 1)) out.push(k)
  return out
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

/**
 * Can a booking of `serviceId` start at `startsAt`, given the diary? Null when
 * it can. Checked in order of what the guest can do about it.
 */
export function checkBooking(
  input: { serviceId: string; startsAt: string },
  ctx: Context,
  cfg: TenantConfig = tenant,
): Violation | null {
  const service = serviceById(input.serviceId, cfg)
  if (!service) return { code: 'bad-service', message: 'Choose a service.' }

  const start = new Date(input.startsAt)
  if (typeof input.startsAt !== 'string' || Number.isNaN(start.getTime())) {
    return { code: 'bad-time', message: 'That is not a valid time.' }
  }

  const now = ctx.now.getTime()
  if (start.getTime() <= now) {
    return { code: 'past', message: 'That time has passed. Please choose a later one.' }
  }

  const guest = (ctx.actor ?? 'guest') === 'guest'
  if (guest && start.getTime() - now < cfg.rules.minNoticeMinutes * 60_000) {
    const hours = cfg.rules.minNoticeMinutes / 60
    return {
      code: 'too-soon',
      message: `Online bookings need at least ${hours} hour${hours === 1 ? '' : 's'}’ notice. Please choose a later time.`,
    }
  }

  const key = shopDateKey(start)
  if (guest && key > lastBookableDay(ctx.now, cfg)) {
    return {
      code: 'too-far',
      message: `Bookings open ${cfg.rules.maxAdvanceDays / 7} weeks ahead. Please choose an earlier date.`,
    }
  }

  const hours = openingOn(key, cfg)
  if (!hours) return { code: 'closed', message: 'Closed that day. Please choose another.' }

  const open = at(key, hours.open)
  const close = at(key, hours.close)
  const offGrid = (start.getTime() - open.getTime()) % (cfg.rules.slotMinutes * 60_000) !== 0
  if (start < open || offGrid) {
    return { code: 'outside-hours', message: `That isn't a bookable time. Hours that day are ${hours.open}–${hours.close}.` }
  }

  const span = spanOf(start, service, cfg)
  if (span.end > close) {
    return {
      code: 'after-close',
      message: `A ${service.name.toLowerCase()} at that time would run past closing (${hours.close}).`,
    }
  }

  const s = span.start.getTime()
  const e = span.blockedUntil.getTime()

  const blocked = ctx.blocks.some((b) => overlaps(s, e, Date.parse(b.startsAt), Date.parse(b.endsAt)))
  if (blocked) return { code: 'blocked', message: 'That time isn’t available. Please choose another.' }

  const taken = ctx.bookings.some(
    (b) =>
      b.status === 'confirmed' &&
      b.id !== ctx.ignoreId &&
      overlaps(s, e, Date.parse(b.startsAt), Date.parse(b.blockedUntil)),
  )
  if (taken) return { code: 'taken', message: TAKEN_MESSAGE }

  return null
}

/** Every start on the grid whose whole service fits inside the day's hours. */
export function gridStarts(key: DateKey, service: Service, cfg: TenantConfig = tenant): Date[] {
  const hours = openingOn(key, cfg)
  if (!hours) return []
  const close = at(key, hours.close)
  const out: Date[] = []
  for (let t = at(key, hours.open); addMinutes(t, service.durationMin) <= close; t = addMinutes(t, cfg.rules.slotMinutes)) {
    out.push(t)
  }
  return out
}

/** The starts a guest may actually book on a date. */
export function freeStarts(key: DateKey, service: Service, ctx: Context, cfg: TenantConfig = tenant): Date[] {
  return gridStarts(key, service, cfg).filter(
    (t) => checkBooking({ serviceId: service.id, startsAt: t.toISOString() }, ctx, cfg) === null,
  )
}

/** A guest may cancel or move their own booking until the cutoff before it starts. */
export function guestCanChange(booking: Pick<Booking, 'status' | 'startsAt'>, now: Date, cfg: TenantConfig = tenant) {
  return (
    booking.status === 'confirmed' &&
    Date.parse(booking.startsAt) - now.getTime() >= cfg.rules.guestChangeCutoffHours * 3_600_000
  )
}

/** A block the owner adds must be a real span, and can't sit on top of a confirmed booking. */
export function checkBlock(
  block: { startsAt: string; endsAt: string },
  bookings: Booking[],
): Violation | null {
  const s = Date.parse(block.startsAt)
  const e = Date.parse(block.endsAt)
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
    return { code: 'bad-time', message: 'A block needs an end after its start.' }
  }
  const clash = bookings.find(
    (b) => b.status === 'confirmed' && overlaps(s, e, Date.parse(b.startsAt), Date.parse(b.blockedUntil)),
  )
  if (clash) return { code: 'taken', message: 'There is a booking in that time. Cancel it first, then block the time.' }
  return null
}

// --- guest details ----------------------------------------------------------

export const LIMITS = { name: 80, phone: 32, email: 120, notes: 400, reason: 120 } as const

/**
 * A phone number as E.164. Australian numbers may be written the local way
 * (0412 345 678, (03) 9555 1234); anything else needs its +country code.
 */
export function normalisePhone(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!/^[+\d\s().-]+$/.test(s)) return null
  const digits = s.replace(/\D/g, '')
  let e164: string
  if (s.startsWith('+')) e164 = `+${digits}`
  else if (digits.startsWith('61') && digits.length === 11) e164 = `+${digits}`
  else if (digits.startsWith('0') && digits.length === 10) e164 = `+61${digits.slice(1)}`
  else return null
  if (e164.startsWith('+61')) return /^\+61[2-478]\d{8}$/.test(e164) ? e164 : null
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Details = { name: string; phone: string; email: string | null; notes: string | null }

/**
 * Trim, cap and validate what a person typed. Never trusts a length or format
 * the browser claims to have checked. Guests must give an email (it's where
 * the manage link goes); the owner taking a booking by phone need not.
 */
export function checkDetails(
  input: { name?: unknown; phone?: unknown; email?: unknown; notes?: unknown },
  opts: { requireEmail: boolean },
): { ok: true; details: Details } | { ok: false; violation: Violation } {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const name = text(input.name, LIMITS.name)
  const phoneRaw = text(input.phone, LIMITS.phone)
  const email = text(input.email, LIMITS.email).toLowerCase()
  const notes = text(input.notes, LIMITS.notes)
  const bad = (message: string) => ({ ok: false as const, violation: { code: 'bad-field' as const, message } })

  if (!name) return bad('Please give your name.')
  const phone = normalisePhone(phoneRaw)
  if (!phone) return bad('Please give a mobile number, e.g. 0412 345 678.')
  if (email && !EMAIL.test(email)) return bad('That email address doesn’t look right.')
  if (!email && opts.requireEmail) return bad('Please give an email so we can send your confirmation.')

  return { ok: true, details: { name, phone, email: email || null, notes: notes || null } }
}
