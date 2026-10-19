/**
 * Everything specific to V Barbers. The booking engine reads its hours, its
 * services and its rules from here and nowhere else; `supabase/seed.sql`
 * carries the same values for the shared database. Change one, change both.
 *
 * Services, hours, overrides and the address are from Vance's Booksy page
 * (`vbarbersz`). Anything marked `confirm with Vance` is a sensible default
 * that did not come from Booksy.
 *
 * Imported with relative paths only, so the Node test runner can load it.
 */

export type DateKey = string // 'YYYY-MM-DD', in the shop's own calendar
export type HHMM = string // 'HH:MM', 24-hour, shop-local wall clock

export type Service = {
  /** The row id in Supabase too: `supabase/seed.sql` uses the same UUIDs. */
  id: string
  name: string
  durationMin: number
  priceCents: number
}

export type DateOverride = {
  date: DateKey
  closed: boolean
  open?: HHMM
  close?: HHMM
  note?: string
}

export type TenantConfig = {
  slug: string
  name: string
  barber: string
  timezone: string
  address: { street: string; locality: string; region: string; postcode: string }
  instagram: string
  booksy: string
  /** As Booksy shows it: the handle, and the tag under the rating. */
  booksyName: string
  payment: string
  services: Service[]
  /** Index 0 is Sunday. `null` is closed all day. */
  weeklyHours: ([HHMM, HHMM] | null)[]
  overrides: DateOverride[]
  rules: {
    slotMinutes: number
    bufferMinutes: number
    minNoticeMinutes: number
    maxAdvanceDays: number
    guestChangeCutoffHours: number
  }
}

export const tenant: TenantConfig = {
  slug: 'vbarbers',
  name: 'V Barbers',
  barber: 'Vance',
  timezone: 'Australia/Melbourne',
  address: { street: '41 Flowerdale Road', locality: 'Hampton East', region: 'VIC', postcode: '3188' },
  instagram: 'vbarbersz',
  booksy: 'vbarbersz',
  booksyName: 'vbarbersz',
  payment: 'Pay by PayID or cash at your appointment.',

  services: [
    { id: '74cdb172-7b61-5260-9f17-9e6d24c2e17d', name: 'Haircut', durationMin: 45, priceCents: 5000 },
    { id: '25ff47d7-538d-59d3-85ae-02c77364f6c2', name: 'Haircut + beard', durationMin: 60, priceCents: 6000 },
  ],

  weeklyHours: [
    null, // Sunday
    null, // Monday
    ['10:00', '18:15'],
    ['10:00', '18:15'],
    ['10:00', '18:15'],
    ['10:00', '18:15'],
    ['11:00', '18:00'], // Saturday
  ],

  overrides: [
    { date: '2026-11-05', closed: true },
    { date: '2026-11-06', closed: true },
    { date: '2026-11-07', closed: true },
    { date: '2026-11-08', closed: true },
    { date: '2026-11-09', closed: true },
  ],

  rules: {
    slotMinutes: 15,
    bufferMinutes: 0, // confirm with Vance
    minNoticeMinutes: 120, // confirm with Vance
    maxAdvanceDays: 42, // confirm with Vance
    guestChangeCutoffHours: 12, // confirm with Vance
  },
}

export const fullAddress = (t: TenantConfig = tenant) =>
  `${t.address.street}, ${t.address.locality} ${t.address.region} ${t.address.postcode}`
