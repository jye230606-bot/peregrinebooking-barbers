import type { Block, Booking, BookingStatus } from '../types.ts'
import { SlotTaken, type BookingStore } from './store.ts'

/**
 * Peregrine's shared Supabase, over PostgREST, as the service role. Server
 * only: the key bypasses row-level security, which is deny-all for everyone
 * else, and the browser never talks to Supabase at all.
 *
 * Every read and write is scoped to this tenant's id, looked up once by slug.
 * Double booking is refused by the `bookings_no_overlap` exclusion constraint
 * inside Postgres, so `exclusive` is a plain call-through and a refused write
 * (SQLSTATE 23P01) surfaces as SlotTaken.
 */

type Options = { url: string; serviceKey: string; tenantSlug: string; fetcher?: typeof fetch }

type BookingRow = {
  id: string
  tenant_id: string
  service_id: string
  customer_id: string
  starts_at: string
  ends_at: string
  blocked_until: string
  status: BookingStatus
  price_cents_snapshot: number
  notes: string | null
  source: 'web' | 'owner'
  manage_token_hash: string | null
  created_at: string
  updated_at: string
  cancelled_at: string | null
  customer?: { name: string; phone: string; email: string | null }
}

type BlockRow = { id: string; tenant_id: string; starts_at: string; ends_at: string; reason: string | null }

const iso = (s: string | null) => (s ? new Date(s).toISOString() : null)

function fromRow(r: BookingRow): Booking {
  return {
    id: r.id,
    serviceId: r.service_id,
    startsAt: iso(r.starts_at)!,
    endsAt: iso(r.ends_at)!,
    blockedUntil: iso(r.blocked_until)!,
    status: r.status,
    priceCentsSnapshot: r.price_cents_snapshot,
    customer: { name: r.customer?.name ?? '', phone: r.customer?.phone ?? '', email: r.customer?.email ?? null },
    notes: r.notes,
    source: r.source,
    manageTokenHash: r.manage_token_hash,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    cancelledAt: iso(r.cancelled_at),
  }
}

const fromBlockRow = (r: BlockRow): Block => ({
  id: r.id,
  startsAt: iso(r.starts_at)!,
  endsAt: iso(r.ends_at)!,
  reason: r.reason,
})

/** Throw for a failed PostgREST call; a double booking gets its own error. */
async function refuse(res: Response): Promise<void> {
  if (res.ok) return
  const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string }
  if (err.code === '23P01') throw new SlotTaken()
  throw new Error(`store unavailable (${res.status}${err.code ? `: ${err.code}` : ''})`)
}

export function supabaseStore({ url, serviceKey, tenantSlug, fetcher = (...a) => fetch(...a) }: Options): BookingStore {
  const rest = `${url.replace(/\/$/, '')}/rest/v1`
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  const q = encodeURIComponent

  const call = (pathAndQuery: string, init: RequestInit = {}) =>
    fetcher(`${rest}/${pathAndQuery}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
      cache: 'no-store',
    })

  let tenantId: Promise<string> | null = null
  const tenant = () => {
    tenantId ??= (async () => {
      const res = await call(`tenants?slug=eq.${q(tenantSlug)}&select=id`)
      await refuse(res)
      const rows = (await res.json()) as { id: string }[]
      if (!rows[0]) throw new Error(`no tenant "${tenantSlug}" — has supabase/seed.sql been run?`)
      return rows[0].id
    })().catch((e) => {
      tenantId = null // don't cache a failure
      throw e
    })
    return tenantId
  }

  const bookingSelect = `select=*,customer:customers(name,phone,email)`

  async function upsertCustomer(t: string, c: Booking['customer'], source: string): Promise<string> {
    // Omitting email leaves an existing one in place on conflict.
    const body: Record<string, unknown> = { tenant_id: t, name: c.name, phone: c.phone, source }
    if (c.email) body.email = c.email
    const res = await call(`customers?on_conflict=tenant_id,phone`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body),
    })
    await refuse(res)
    const rows = (await res.json()) as { id: string }[]
    return rows[0].id
  }

  return {
    async listBookings(range) {
      const t = await tenant()
      const res = await call(
        `bookings?${bookingSelect}&tenant_id=eq.${t}&starts_at=lt.${q(range.to)}&blocked_until=gt.${q(range.from)}&order=starts_at`,
      )
      await refuse(res)
      return ((await res.json()) as BookingRow[]).map(fromRow)
    },

    async getBooking(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const t = await tenant()
      const res = await call(`bookings?${bookingSelect}&tenant_id=eq.${t}&id=eq.${q(id)}`)
      await refuse(res)
      const rows = (await res.json()) as BookingRow[]
      return rows[0] ? fromRow(rows[0]) : null
    },

    async insertBooking(b) {
      const t = await tenant()
      const customerId = await upsertCustomer(t, b.customer, b.source)
      const row: Omit<BookingRow, 'customer'> = {
        id: b.id,
        tenant_id: t,
        service_id: b.serviceId,
        customer_id: customerId,
        starts_at: b.startsAt,
        ends_at: b.endsAt,
        blocked_until: b.blockedUntil,
        status: b.status,
        price_cents_snapshot: b.priceCentsSnapshot,
        notes: b.notes,
        source: b.source,
        manage_token_hash: b.manageTokenHash,
        created_at: b.createdAt,
        updated_at: b.updatedAt,
        cancelled_at: b.cancelledAt,
      }
      const res = await call('bookings', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      })
      await refuse(res)
    },

    async updateBooking(b) {
      const t = await tenant()
      const res = await call(`bookings?tenant_id=eq.${t}&id=eq.${q(b.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          starts_at: b.startsAt,
          ends_at: b.endsAt,
          blocked_until: b.blockedUntil,
          status: b.status,
          notes: b.notes,
          updated_at: b.updatedAt,
          cancelled_at: b.cancelledAt,
        }),
      })
      await refuse(res)
      if (((await res.json()) as unknown[]).length === 0) throw new Error(`no booking ${b.id}`)
    },

    async listBlocks(range) {
      const t = await tenant()
      const res = await call(
        `blocks?select=*&tenant_id=eq.${t}&starts_at=lt.${q(range.to)}&ends_at=gt.${q(range.from)}&order=starts_at`,
      )
      await refuse(res)
      return ((await res.json()) as BlockRow[]).map(fromBlockRow)
    },

    async insertBlock(b) {
      const t = await tenant()
      const res = await call('blocks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ id: b.id, tenant_id: t, starts_at: b.startsAt, ends_at: b.endsAt, reason: b.reason }),
      })
      await refuse(res)
    },

    async deleteBlock(id) {
      const t = await tenant()
      const res = await call(`blocks?tenant_id=eq.${t}&id=eq.${q(id)}`, { method: 'DELETE' })
      await refuse(res)
    },

    exclusive: (job) => job(),
  }
}
