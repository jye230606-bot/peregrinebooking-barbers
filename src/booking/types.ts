/**
 * The booking domain's shapes. Instants are ISO strings in UTC; dates and
 * clock times are the shop's own (see `time.ts`).
 */

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export type Customer = {
  name: string
  /** E.164, e.g. +61412345678. One customer per phone per tenant. */
  phone: string
  email: string | null
}

export type Booking = {
  id: string
  serviceId: string
  startsAt: string
  endsAt: string
  /** `endsAt` plus the buffer: the span nothing else may overlap. */
  blockedUntil: string
  status: BookingStatus
  priceCentsSnapshot: number
  customer: Customer
  notes: string | null
  source: 'web' | 'owner'
  /** SHA-256 of the guest's manage token. The token itself is never stored. */
  manageTokenHash: string | null
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
}

export type Block = {
  id: string
  startsAt: string
  endsAt: string
  reason: string | null
}

/** Half-open [from, to) in instants. */
export type Range = { from: string; to: string }
