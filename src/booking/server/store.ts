import type { Block, Booking, Range } from '../types.ts'
import type { Schedule } from '../schedule.ts'

/**
 * Where the diary lives. Everything the API enforces sits above this line;
 * a store only reads, writes and serialises. Chosen by STORE=file|supabase
 * in `config.ts`.
 */
export interface BookingStore {
  /** Bookings of any status whose blocked span overlaps the range. */
  listBookings(range: Range): Promise<Booking[]>
  getBooking(id: string): Promise<Booking | null>
  /** Throws SlotTaken if a confirmed booking already holds any of its span. */
  insertBooking(booking: Booking): Promise<void>
  /** Throws SlotTaken, as insert does, when a move lands on a held span. */
  updateBooking(booking: Booking): Promise<void>
  listBlocks(range: Range): Promise<Block[]>
  insertBlock(block: Block): Promise<void>
  deleteBlock(id: string): Promise<void>
  /**
   * Run a read-check-write as one step. The file store serialises them; the
   * Supabase store calls straight through, because its exclusion constraint
   * refuses an overlapping write inside Postgres whatever the app thought.
   */
  exclusive<T>(job: () => Promise<T>): Promise<T>
  /** The shop's services, hours, closures and rules as stored, or null to use the built-in ones. */
  loadSchedule(): Promise<Schedule | null>
}

/** The store refused a write because the slot is held. The API answers 409 "taken". */
export class SlotTaken extends Error {
  constructor() {
    super('slot taken')
    this.name = 'SlotTaken'
  }
}

/** Does a booking's blocked span overlap the range? */
export function inRange(b: { startsAt: string; blockedUntil?: string; endsAt: string }, range: { from: string; to: string }) {
  return Date.parse(b.startsAt) < Date.parse(range.to) && Date.parse(b.blockedUntil ?? b.endsAt) > Date.parse(range.from)
}
