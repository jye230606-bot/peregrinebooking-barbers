import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Block, Booking } from '../types.ts'
import { SlotTaken, inRange, type BookingStore } from './store.ts'

/**
 * Development store: one JSON file. Right for local work and the demo; wrong
 * on Vercel, where the filesystem is per-instance and thrown away.
 *
 * It refuses an overlapping confirmed booking on write, the way the Supabase
 * exclusion constraint does, so both stores fail the same way.
 */

type Diary = { bookings: Booking[]; blocks: Block[] }

/** A promise chain: jobs queue behind each other instead of interleaving. */
function queue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T,>(job: () => Promise<T>): Promise<T> => {
    const next = tail.then(job, job)
    tail = next.catch(() => undefined)
    return next
  }
}

const holds = (a: Booking, b: Booking) =>
  a.id !== b.id &&
  a.status === 'confirmed' &&
  b.status === 'confirmed' &&
  Date.parse(a.startsAt) < Date.parse(b.blockedUntil) &&
  Date.parse(b.startsAt) < Date.parse(a.blockedUntil)

export function fileStore(file: string): BookingStore {
  // Two chains: `exclusive` holds its lock across the reads and writes it
  // makes, so those can't wait on the same chain or they would wait forever.
  const io = queue()
  const lock = queue()

  const read = async (): Promise<Diary> => {
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<Diary>
      return { bookings: raw.bookings ?? [], blocks: raw.blocks ?? [] }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { bookings: [], blocks: [] }
      throw e
    }
  }

  const write = async (diary: Diary) => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    // Write beside, then rename: a crash mid-write can't truncate the diary.
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(diary, null, 2), 'utf8')
    await fs.rename(tmp, file)
  }

  const change = (fn: (d: Diary) => void) =>
    io(async () => {
      const diary = await read()
      fn(diary)
      await write(diary)
    })

  return {
    listBookings: (range) => io(async () => (await read()).bookings.filter((b) => inRange(b, range))),

    getBooking: (id) => io(async () => (await read()).bookings.find((b) => b.id === id) ?? null),

    insertBooking: (booking) =>
      change((d) => {
        if (d.bookings.some((b) => b.id === booking.id)) throw new Error(`booking ${booking.id} exists`)
        if (d.bookings.some((b) => holds(b, booking))) throw new SlotTaken()
        d.bookings.push(booking)
      }),

    updateBooking: (booking) =>
      change((d) => {
        const i = d.bookings.findIndex((b) => b.id === booking.id)
        if (i === -1) throw new Error(`no booking ${booking.id}`)
        if (d.bookings.some((b) => holds(b, booking))) throw new SlotTaken()
        d.bookings[i] = booking
      }),

    listBlocks: (range) =>
      io(async () => (await read()).blocks.filter((b) => inRange(b, range))),

    insertBlock: (block) => change((d) => void d.blocks.push(block)),

    deleteBlock: (id) =>
      change((d) => {
        d.blocks = d.blocks.filter((b) => b.id !== id)
      }),

    exclusive: (job) => lock(job),
  }
}
