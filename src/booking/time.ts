import { tenant, type DateKey, type HHMM } from '../config/tenant.ts'

/**
 * Shop-local time, wherever the code runs. A server on UTC and a guest whose
 * phone is set to another zone both see Melbourne's dates and clock.
 *
 * Built on Intl alone, so it works the same in the browser, on the server and
 * under the Node test runner, and daylight saving is the platform's tz data.
 */

const TZ = tenant.timezone
const pad = (n: number) => String(n).padStart(2, '0')

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// h23, not hour12: false — the latter prints midnight as "24" in some engines.
const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Which of the shop's days an instant falls on. */
export function shopDateKey(d: Date): DateKey {
  return dayFormat.format(d)
}

export function todayKey(now = new Date()): DateKey {
  return shopDateKey(now)
}

/** Minutes past shop-local midnight. */
export function shopMinutes(d: Date): number {
  const [h, m] = clockFormat.format(d).split(':').map(Number)
  return h * 60 + m
}

export function minutesOf(hhmm: HHMM): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * 'YYYY-MM-DD' + 'HH:MM' on the shop's wall clock → the instant.
 *
 * Guess as if the wall clock were UTC, then correct by the difference between
 * that guess and what Melbourne's clock read at it. The second pass settles the
 * case where the offset differs between the guess and the answer, which only
 * happens within hours of a daylight-saving change.
 */
export function at(key: DateKey, hhmm: HHMM): Date {
  const [y, m, d] = key.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, min)
  let instant = wall
  for (let pass = 0; pass < 2; pass++) {
    const guess = new Date(instant)
    const [gy, gm, gd] = shopDateKey(guess).split('-').map(Number)
    instant += wall - Date.UTC(gy, gm - 1, gd, 0, shopMinutes(guess))
  }
  return new Date(instant)
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000)
}

/** Calendar arithmetic on date keys, independent of any zone. */
export function shiftDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** 0 = Sunday. */
export function weekdayOf(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** '10:45' */
export function timeLabel(d: Date | string): string {
  return clockFormat.format(typeof d === 'string' ? new Date(d) : d)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const weekdayName = (i: number) => LONG_DAYS[i]
export const weekdayShort = (i: number) => DAYS[i]

/** 'Tue 21 Oct' */
export function dateLabel(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number)
  return `${DAYS[weekdayOf(key)]} ${d} ${MONTHS[m - 1]}`
}

/** 'Tuesday 21 October 2026', for emails. */
export function longDateLabel(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'long', timeZone: 'UTC' })
  return `${LONG_DAYS[weekdayOf(key)]} ${d} ${month} ${y}`
}
