import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tenant } from "../src/config/tenant.ts";
import { handle } from "../src/booking/server/api.ts";
import { supabaseStore } from "../src/booking/server/supabaseStore.ts";
import { SlotTaken } from "../src/booking/server/store.ts";
import { at } from "../src/booking/time.ts";

/**
 * The Supabase store against a stand-in PostgREST that behaves like the
 * migration: tenant-scoped rows, a customer upsert on (tenant_id, phone), and
 * the `bookings_no_overlap` exclusion constraint answering 23P01. Every call
 * gets a random delay so concurrent requests interleave the way they do over
 * the network. `npm run store:check` runs the same race against the real DB.
 */

const [HAIRCUT] = tenant.services;
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_TENANT = "00000000-0000-4000-8000-000000000002";
const TUESDAY = "2026-10-20";

function fakePostgrest() {
  const db = {
    customers: [],
    bookings: [],
    blocks: [],
    rules: { slot_minutes: 45, buffer_minutes: 0, min_notice_minutes: 120, max_advance_days: 21, guest_change_cutoff_hours: 12 },
    services: [
      { id: HAIRCUT.id, tenant_id: TENANT_ID, name: "Haircut", duration_min: 45, price_cents: 5000, active: true, sort: 1 },
      { id: "s-old", tenant_id: TENANT_ID, name: "Old cut", duration_min: 30, price_cents: 3000, active: false, sort: 2 },
    ],
    weekly_hours: [2, 3, 4, 5].map((weekday) => ({ tenant_id: TENANT_ID, weekday, open_local: "10:00:00", close_local: "18:15:00" }))
      .concat([{ tenant_id: TENANT_ID, weekday: 6, open_local: "11:00:00", close_local: "18:00:00" }]),
    date_overrides: [
      { tenant_id: TENANT_ID, date: "2026-10-01", closed: true, open_local: null, close_local: null, note: null }, // past
      { tenant_id: TENANT_ID, date: "2026-11-05", closed: true, open_local: null, close_local: null, note: null },
    ],
  };
  const calls = [];
  const delay = () => new Promise((r) => setTimeout(r, Math.random() * 15));
  const respond = (status, json) => new Response(json === undefined ? null : JSON.stringify(json), { status });
  const params = (url) => Object.fromEntries(new URL(url).searchParams);
  const eq = (p, key) => p[key]?.replace(/^eq\./, "");

  const fetch = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    const table = new URL(url).pathname.split("/").pop();
    const p = params(url);
    calls.push({ table, method, body, url: String(url) });
    // Every call must target the vbarbers schema, never public.
    if (init.headers?.["Accept-Profile"] !== "vbarbers" || init.headers?.["Content-Profile"] !== "vbarbers") {
      return respond(404, { code: "PGRST106", message: "wrong schema" });
    }
    await delay();

    if (table === "tenants") {
      const hit = eq(p, "slug") === "vbarbers" || eq(p, "id") === TENANT_ID;
      return respond(200, hit ? [{ id: TENANT_ID, ...db.rules }] : []);
    }
    if (["services", "weekly_hours", "date_overrides"].includes(table) && method === "GET") {
      let rows = db[table].filter((r) => r.tenant_id === eq(p, "tenant_id"));
      if (p.active) rows = rows.filter((r) => String(r.active) === p.active.replace(/^eq\./, ""));
      if (p.date) rows = rows.filter((r) => r.date >= p.date.replace(/^gte\./, ""));
      return respond(200, rows);
    }

    if (table === "customers" && method === "POST") {
      let row = db.customers.find((c) => c.tenant_id === body.tenant_id && c.phone === body.phone);
      if (row) Object.assign(row, body);
      else db.customers.push((row = { id: crypto.randomUUID(), email: null, ...body }));
      return respond(201, [row]);
    }

    if (table === "bookings" && method === "POST") {
      const s = Date.parse(body.starts_at);
      const e = Date.parse(body.blocked_until);
      const clash =
        body.status === "confirmed" &&
        db.bookings.some(
          (b) => b.tenant_id === body.tenant_id && b.status === "confirmed" && s < Date.parse(b.blocked_until) && Date.parse(b.starts_at) < e,
        );
      if (clash) return respond(409, { code: "23P01", message: "conflicting key value violates exclusion constraint" });
      db.bookings.push(body);
      return respond(201);
    }

    if (table === "bookings" && method === "GET") {
      const rows = db.bookings
        .filter((b) => b.tenant_id === eq(p, "tenant_id"))
        .filter((b) => !p.id || b.id === eq(p, "id"))
        .filter((b) => !p.starts_at || Date.parse(b.starts_at) < Date.parse(p.starts_at.replace(/^lt\./, "")))
        .filter((b) => !p.blocked_until || Date.parse(b.blocked_until) > Date.parse(p.blocked_until.replace(/^gt\./, "")))
        .map((b) => ({ ...b, customer: db.customers.find((c) => c.id === b.customer_id) }));
      return respond(200, rows);
    }

    if (table === "bookings" && method === "PATCH") {
      const rows = db.bookings.filter((b) => b.tenant_id === eq(p, "tenant_id") && b.id === eq(p, "id"));
      for (const r of rows) Object.assign(r, body);
      return respond(200, rows);
    }

    if (table === "blocks") return respond(200, []);
    return respond(404, { message: "unknown" });
  };

  return { db, calls, fetch };
}

let pg;
let config;

beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: at("2026-10-19", "09:00") });
  pg = fakePostgrest();
  config = {
    store: supabaseStore({ url: "https://x.supabase.co", serviceKey: "service-key", tenantSlug: "vbarbers", fetcher: pg.fetch }),
    mailer: null,
  };
});

const booking = (id, hhmm = "10:00") => {
  const start = at(TUESDAY, hhmm);
  const end = new Date(start.getTime() + 45 * 60_000).toISOString();
  return {
    id,
    serviceId: HAIRCUT.id,
    startsAt: start.toISOString(),
    endsAt: end,
    blockedUntil: end,
    status: "confirmed",
    priceCentsSnapshot: 5000,
    customer: { name: "Kai", phone: "+61412345678", email: "kai@example.com" },
    notes: null,
    source: "web",
    manageTokenHash: "a".repeat(64),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cancelledAt: null,
  };
};

const req = (body) => ({
  method: "POST",
  path: "/bookings",
  query: {},
  body,
  ip: "203.0.113.9",
  contentType: "application/json",
  origin: "http://127.0.0.1:3000",
  secure: false,
});

test("a booking is written with its tenant, an upserted customer, and the service key", async () => {
  await config.store.insertBooking(booking("11111111-1111-4111-8111-111111111111"));
  const insert = pg.calls.find((c) => c.table === "bookings" && c.method === "POST");
  assert.equal(insert.body.tenant_id, TENANT_ID);
  assert.equal(insert.body.customer_id, pg.db.customers[0].id);
  assert.equal(insert.body.blocked_until, insert.body.ends_at);
  assert.equal(insert.body.manage_token_hash.length, 64);
  const upsert = pg.calls.find((c) => c.table === "customers");
  assert.match(upsert.url, /on_conflict=tenant_id,phone/);
  assert.equal(pg.db.customers.length, 1);

  // The same phone again reuses the customer.
  await config.store.insertBooking(booking("22222222-2222-4222-8222-222222222222", "12:00"));
  assert.equal(pg.db.customers.length, 1);
});

test("every read is scoped to the tenant", async () => {
  await config.store.insertBooking(booking("11111111-1111-4111-8111-111111111111"));
  pg.db.bookings.push({ ...pg.db.bookings[0], id: "99999999-9999-4999-8999-999999999999", tenant_id: OTHER_TENANT });
  const all = await config.store.listBookings({ from: at(TUESDAY, "00:00").toISOString(), to: at("2026-10-21", "00:00").toISOString() });
  assert.equal(all.length, 1);
  assert.equal(all[0].customer.name, "Kai");
  assert.ok(pg.calls.filter((c) => c.table === "bookings" && c.method === "GET").every((c) => c.url.includes(`tenant_id=eq.${TENANT_ID}`)));
  assert.equal(await config.store.getBooking("99999999-9999-4999-8999-999999999999"), null);
});

test("the exclusion constraint's 23P01 comes back as SlotTaken", async () => {
  await config.store.insertBooking(booking("11111111-1111-4111-8111-111111111111"));
  await assert.rejects(config.store.insertBooking(booking("33333333-3333-4333-8333-333333333333", "10:30")), SlotTaken);
});

test("two parallel inserts for the same slot: exactly one succeeds, the other gets a clean 'slot taken'", async () => {
  // Both requests read an empty diary and pass every rule; only the database can choose.
  const body = (n) => ({
    serviceId: HAIRCUT.id,
    startsAt: at(TUESDAY, "15:15").toISOString(),
    name: `Racer ${n}`,
    phone: `041200000${n}`,
    email: `racer${n}@example.com`,
  });
  const results = await Promise.all([handle(req(body(1)), config), handle(req(body(2)), config)]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409]);
  const loser = results.find((r) => r.status === 409);
  assert.equal(loser.body.code, "taken");
  assert.match(loser.body.error, /just been taken/);
  assert.equal(pg.db.bookings.filter((b) => b.status === "confirmed").length, 1);
});

test("a cancelled booking frees its slot at the database too", async () => {
  const b = booking("11111111-1111-4111-8111-111111111111");
  await config.store.insertBooking(b);
  await config.store.updateBooking({ ...b, status: "cancelled", cancelledAt: new Date().toISOString() });
  await config.store.insertBooking(booking("44444444-4444-4444-8444-444444444444"));
  assert.equal(pg.db.bookings.filter((x) => x.status === "confirmed").length, 1);
});

test("the schedule comes from the database", async () => {
  const s = await config.store.loadSchedule();
  assert.deepEqual(s.services, [{ id: HAIRCUT.id, name: "Haircut", durationMin: 45, priceCents: 5000 }]);
  assert.equal(s.weeklyHours.length, 7);
  assert.equal(s.weeklyHours[0], null);
  assert.equal(s.weeklyHours[1], null);
  assert.deepEqual(s.weeklyHours[2], ["10:00", "18:15"]);
  assert.deepEqual(s.weeklyHours[6], ["11:00", "18:00"]);
  assert.deepEqual(s.overrides, [{ date: "2026-11-05", closed: true }]);
  assert.deepEqual(s.rules, { slotMinutes: 45, bufferMinutes: 0, minNoticeMinutes: 120, maxAdvanceDays: 21, guestChangeCutoffHours: 12 });
});

test("a weekday with two rows opens at the earliest and closes at the latest", async () => {
  pg.db.weekly_hours.push({ tenant_id: TENANT_ID, weekday: 2, open_local: "09:00:00", close_local: "12:00:00" });
  const s = await config.store.loadSchedule();
  assert.deepEqual(s.weeklyHours[2], ["09:00", "18:15"]);
});
