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
 *
 * With SUPABASE_ANON_KEY set it also checks the console's row-level security:
 * two throwaway sign-ins, one a member of the self-test shop and one not.
 * The member sees the shop's booking; the other reads nothing. Both users are
 * deleted afterwards.
 */
import nextEnv from "@next/env";
import { SCHEMA, supabaseStore } from "../src/booking/server/supabaseStore.ts";
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
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "Accept-Profile": SCHEMA,
  "Content-Profile": SCHEMA,
};

async function call(path, init = {}) {
  const res = await fetch(`${rest}/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const ok = (msg) => console.log(`  ✔ ${msg}`);
let tenantId = null;
let failed = false;
const users = [];
const anon = process.env.SUPABASE_ANON_KEY;
const auth = (path, init = {}, bearer = key, apikey = key) =>
  fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: { apikey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`auth ${path.split("?")[0]} → ${r.status} ${JSON.stringify(body)}`);
    return body;
  });

/** A confirmed throwaway user, signed in with a password: an ordinary session. */
async function throwawaySession(label) {
  const email = `selftest+${label}-${crypto.randomUUID().slice(0, 8)}@peregrinepartners.space`;
  const password = crypto.randomUUID();
  const user = await auth("admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
  users.push(user.id);
  const session = await auth("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }, anon, anon);
  return { id: user.id, token: session.access_token };
}

const asUser = (token, path) =>
  fetch(`${rest}/${path}`, { headers: { apikey: anon, Authorization: `Bearer ${token}`, "Accept-Profile": SCHEMA } }).then((r) => r.json());

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

  if (!anon) {
    console.log("  (set SUPABASE_ANON_KEY to also check member access)");
  } else {
    const member = await throwawaySession("member");
    const stranger = await throwawaySession("stranger");
    await call("members", { method: "POST", body: JSON.stringify({ tenant_id: tenantId, user_id: member.id }) });
    const q = `bookings?tenant_id=eq.${tenantId}&status=eq.confirmed&select=id`;
    const mine = await asUser(member.token, q);
    if (!Array.isArray(mine) || mine.length !== 1) throw new Error(`member read ${JSON.stringify(mine)}`);
    ok("a member reads their shop");
    const theirs = await asUser(stranger.token, q);
    if (!Array.isArray(theirs) || theirs.length !== 0) throw new Error(`non-member read ${JSON.stringify(theirs)}`);
    ok("a non-member reads nothing");
  }
} catch (e) {
  failed = true;
  console.error(`  ✖ ${e.message}`);
} finally {
  if (tenantId) {
    // Children first: the foreign keys are ON DELETE RESTRICT.
    for (const table of ["members", "bookings", "blocks", "customers", "services", "weekly_hours", "date_overrides", "reviews"]) {
      await call(`${table}?tenant_id=eq.${tenantId}`, { method: "DELETE" }).catch((e) => console.error(`  cleanup ${table}: ${e.message}`));
    }
    await call(`tenants?id=eq.${tenantId}`, { method: "DELETE" }).catch((e) => console.error(`  cleanup tenant: ${e.message}`));
    console.log("  cleaned up the self-test tenant");
  }
  for (const id of users) {
    await auth(`admin/users/${id}`, { method: "DELETE" }).catch((e) => console.error(`  cleanup user: ${e.message}`));
  }
}

process.exit(failed ? 1 : 0);
