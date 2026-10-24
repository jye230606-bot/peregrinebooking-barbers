import path from 'node:path'
import { tenant, type TenantConfig } from '../../config/tenant.ts'
import { withSchedule } from '../schedule.ts'
import { mailerFromEnv, type Mailer } from './email.ts'
import { fileStore } from './fileStore.ts'
import { supabaseStore } from './supabaseStore.ts'
import type { BookingStore } from './store.ts'

/**
 * Server configuration, resolved once per instance. Kept apart from `api.ts`
 * so the handlers stay testable with whatever store and mailer a test hands
 * them.
 */

export type Config = {
  store: BookingStore
  /** Null until a provider and BOOKING_FROM_EMAIL are set; bookings still work. */
  mailer: Mailer | null
  ownerEmail?: string
  /** Absolute origin for links in emails; falls back to the request's own. */
  siteUrl?: string
}

export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): BookingStore {
  const kind = env.STORE ?? 'file'
  const slug = env.TENANT_SLUG ?? tenant.slug
  if (slug !== tenant.slug) throw new Error(`TENANT_SLUG is "${slug}" but this build is configured for "${tenant.slug}".`)

  if (kind === 'supabase') {
    const url = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('STORE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    return supabaseStore({ url, serviceKey: key, tenantSlug: slug })
  }
  if (kind === 'file') {
    return fileStore(env.STORE_FILE ?? path.join(process.cwd(), '.data', `${slug}.json`))
  }
  throw new Error(`STORE must be "file" or "supabase", not "${kind}".`)
}

const SCHEDULE_TTL_MS = 60_000
const schedules = new WeakMap<BookingStore, { at: number; value: Promise<TenantConfig> }>()

/**
 * The shop's config in force now: the brand from code, with the services,
 * hours, closures and rules Vance keeps in the console laid over it. Read at
 * most once a minute per store, so a change shows within a minute; a failed
 * read isn't kept.
 */
export function tenantConfig(store: BookingStore, now = Date.now()): Promise<TenantConfig> {
  const hit = schedules.get(store)
  if (hit && now - hit.at < SCHEDULE_TTL_MS) return hit.value
  const value = store.loadSchedule().then((s) => withSchedule(tenant, s))
  schedules.set(store, { at: now, value })
  value.catch(() => schedules.delete(store))
  return value
}

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached
  const env = process.env
  cached = {
    store: storeFromEnv(env),
    mailer: mailerFromEnv(env),
    ownerEmail: env.OWNER_EMAIL || undefined,
    siteUrl: env.SITE_URL || undefined,
  }
  return cached
}
