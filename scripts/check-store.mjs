/**
 * Exercise the real Supabase store before trusting it with real bookings.
 *
 *   npm run store:check
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, and the
 * migration applied. It works under its own tenant, `vbarbers-selftest`, so it
 * never reads or touches V Barbers' diary, and deletes everything it made when
 * it's done — including if a check fails.
 *
 * Checks: insert and read back; tenant scoping; and the race — two parallel
 * inserts for the same slot, where exactly one may succeed and the other must
 * come back as a clean SlotTaken from the exclusion constraint.
 */
import nextEnv from "@next/env";
import { supabaseStore } from "../src/booking/server/supabaseStore.ts";
import { SlotTaken } from "../src/booking/server/store.ts";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.startsWith("https://") || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const SLUG = "vbarbers-selftest";
const rest = `${url}/rest/v1`;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function call(path, init = {}) {
  const res = await fetch(`${rest}/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const ok = (msg) => console.log(`  ✔ ${msg}`);
let tenantId = null;
let failed = false;

try {
  console.log(`Self-test tenant "${SLUG}" on ${new URL(url).host}`);
  const [tenant] = await call("tenants?on_conflict=slug", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ slug: SLUG, name: "Store self-test", timezone: "Australia/Melbourne" }),
  });
  tenantId = tenant.id;
  const [service] = await call("services", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Self-test cut", duration_min: 45, price_cents: 0, active: false }),
  });

  const store = supabaseStore({ url, serviceKey: key, tenantSlug: SLUG });
  const start = new Date(Date.UTC(2030, 0, 15, 0, 0)); // far future, nowhere near a real booking
  const end = new Date(start.getTime() + 45 * 60_000);
  const booking = (n) => ({
    id: crypto.randomUUID(),
    serviceId: service.id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    blockedUntil: end.toISOString(),
    status: "confirmed",
    priceCentsSnapshot: 0,
    customer: { name: `Self test ${n}`, phone: `+6140000099${n}`, email: null },
    notes: null,
    source: "owner",
    manageTokenHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cancelledAt: null,
  });

  // The race: both writes are sent at once; only the database can choose.
  const results = await Promise.allSettled([store.insertBooking(booking(1)), store.insertBooking(booking(2))]);
  const won = results.filter((r) => r.status === "fulfilled").length;
  const taken = results.filter((r) => r.status === "rejected" && r.reason instanceof SlotTaken).length;
  if (won !== 1 || taken !== 1) {
    throw new Error(`race: expected 1 success + 1 SlotTaken, got ${won} + ${taken} (${results.map((r) => r.reason?.message ?? "ok").join(", ")})`);
  }
  ok("two parallel inserts for one slot: exactly one succeeded, the other got SlotTaken");

  const range = { from: new Date(start.getTime() - 3_600_000).toISOString(), to: new Date(end.getTime() + 3_600_000).toISOString() };
  const read = await store.listBookings(range);
  if (read.length !== 1 || !read[0].customer.name.startsWith("Self test")) throw new Error(`read back ${read.length} bookings`);
  ok("the winner reads back, with its customer");

  await store.updateBooking({ ...read[0], status: "cancelled", cancelledAt: new Date().toISOString() });
  await store.insertBooking(booking(3));
  ok("cancelling frees the slot for a new booking");

  const other = await supabaseStore({ url, serviceKey: key, tenantSlug: "vbarbers" }).listBookings(range).catch(() => []);
  if (other.some((b) => b.customer.name.startsWith("Self test"))) throw new Error("self-test rows visible under vbarbers");
  ok("rows stay inside their tenant");
} catch (e) {
  failed = true;
  console.error(`  ✖ ${e.message}`);
} finally {
  if (tenantId) {
    // Children first: the foreign keys are ON DELETE RESTRICT.
    for (const table of ["bookings", "blocks", "customers", "services", "weekly_hours", "date_overrides", "reviews"]) {
      await call(`${table}?tenant_id=eq.${tenantId}`, { method: "DELETE" }).catch((e) => console.error(`  cleanup ${table}: ${e.message}`));
    }
    await call(`tenants?id=eq.${tenantId}`, { method: "DELETE" }).catch((e) => console.error(`  cleanup tenant: ${e.message}`));
    console.log("  cleaned up the self-test tenant");
  }
}

process.exit(failed ? 1 : 0);
