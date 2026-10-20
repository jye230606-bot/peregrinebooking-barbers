import type { TenantConfig } from '../config/tenant.ts'

/**
 * The part of the shop's setup Vance changes from the console: what he
 * offers, when he works, the days that differ, and the booking rules. The
 * rest of `TenantConfig` (name, address, Instagram) is brand, and stays in
 * code.
 */
export type Schedule = Pick<TenantConfig, 'services' | 'weeklyHours' | 'overrides' | 'rules'>

/** The config in force: `base` with the stored schedule laid over it, if there is one. */
export function withSchedule(base: TenantConfig, s: Schedule | null): TenantConfig {
  return s ? { ...base, ...s } : base
}
