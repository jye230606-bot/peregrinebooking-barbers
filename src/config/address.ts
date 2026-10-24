import { tenant, type TenantConfig } from './tenant.ts'

/**
 * The shop's street address. Guests get it once they've booked — in the
 * confirmation email, the calendar file and their own booking page — and the
 * public site only ever shows the suburb. Keep it out of anything a client
 * component imports: it would ship in the page's JavaScript.
 *
 * Imported with relative paths only, so the Node test runner can load it.
 */
const streets: Record<string, { street: string; postcode: string }> = {
  vbarbers: { street: '41 Flowerdale Road', postcode: '3188' },
}

export const fullAddress = (t: TenantConfig = tenant) => {
  const s = streets[t.slug]
  const area = `${t.address.locality} ${t.address.region}`
  return s ? `${s.street}, ${area} ${s.postcode}` : area
}
