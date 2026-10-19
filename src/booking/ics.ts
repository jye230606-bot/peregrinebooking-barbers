import { fullAddress, tenant, type TenantConfig } from '../config/tenant.ts'
import type { Booking } from './types.ts'
import { serviceById } from './rules.ts'

/**
 * iCalendar (RFC 5545): the guest's "Add to calendar" file and the owner's
 * read-only feed. Times are written in UTC, which every calendar app converts
 * to the viewer's zone, so there is no VTIMEZONE to keep in step.
 */

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join('\r\n ')
}

type EventView = 'guest' | 'owner'

function event(b: Booking, view: EventView, now: Date, cfg: TenantConfig): string[] {
  const service = serviceById(b.serviceId, cfg)
  const name = service?.name ?? 'Appointment'
  const summary = view === 'guest' ? `${name} with ${cfg.barber} · ${cfg.name}` : `${name} — ${b.customer.name}`
  const description =
    view === 'guest'
      ? `${cfg.payment}`
      : [b.customer.phone, b.customer.email, b.notes].filter(Boolean).join('\n')
  return [
    'BEGIN:VEVENT',
    `UID:${b.id}@${cfg.slug}.peregrinepartners.space`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `LAST-MODIFIED:${stamp(new Date(b.updatedAt).toISOString())}`,
    `DTSTART:${stamp(b.startsAt)}`,
    `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(fullAddress(cfg))}`,
    `DESCRIPTION:${escapeText(description)}`,
    `STATUS:${b.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
  ]
}

function calendar(lines: string[], extra: string[]): string {
  return (
    ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//Peregrine Partners//${tenant.name}//EN`, 'CALSCALE:GREGORIAN', ...extra, ...lines, 'END:VCALENDAR']
      .map(fold)
      .join('\r\n') + '\r\n'
  )
}

/** One booking, for the guest. */
export function bookingIcs(b: Booking, now = new Date(), cfg: TenantConfig = tenant): string {
  return calendar(event(b, 'guest', now, cfg), ['METHOD:PUBLISH'])
}

/** The owner's subscribed feed: confirmed bookings, with the customer's details. */
export function feedIcs(bookings: Booking[], now = new Date(), cfg: TenantConfig = tenant): string {
  const lines = bookings.filter((b) => b.status === 'confirmed').flatMap((b) => event(b, 'owner', now, cfg))
  return calendar(lines, [
    `X-WR-CALNAME:${escapeText(`${cfg.name} bookings`)}`,
    `X-WR-TIMEZONE:${cfg.timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ])
}
