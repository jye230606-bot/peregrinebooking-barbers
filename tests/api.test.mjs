import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { tenant } from "../src/config/tenant.ts";
import { handle } from "../src/booking/server/api.ts";
import { fileStore } from "../src/booking/server/fileStore.ts";
import { hashPassword } from "../src/booking/server/auth.ts";
import { at } from "../src/booking/time.ts";

/**
 * The API end to end against a real file store in a temp directory, with the
 * clock frozen on a Monday morning in Melbourne. What matters: strangers see
 * free start times and nothing else; every write re-checks the rules; a
 * manage token opens only its own booking; owner routes need a session.
 */

const [HAIRCUT] = tenant.services;
const TUESDAY = "2026-10-20";
const NOW = at("2026-10-19", "09:00");

let dir;
let config;
let sent;

beforeEach(async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  dir = await mkdtemp(path.join(tmpdir(), "vb-api-"));
  sent = [];
  config = {
    store: fileStore(path.join(dir, "diary.json")),
    mailer: { send: async (m) => void sent.push(m) },
    ownerEmail: "vance@example.com",
  };
  delete process.env.OWNER_PASSWORD_HASH;
  delete process.env.SESSION_SECRET;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const req = (method, p, { body, query = {}, cookie, contentType } = {}) => ({
  method,
  path: p,
  query,
  body,
  ip: "203.0.113.1",
  cookie,
  contentType: contentType ?? (method === "GET" ? undefined : "application/json"),
  origin: "http://127.0.0.1:3000",
  secure: false,
});

const guest = (hhmm = "10:00", extra = {}) => ({
  serviceId: HAIRCUT.id,
  startsAt: at(TUESDAY, hhmm).toISOString(),
  name: "Kai",
  phone: "0412 345 678",
  email: "kai@example.com",
  ...extra,
});

const book = (hhmm, extra) => handle(req("POST", "/bookings", { body: guest(hhmm, extra) }), config);
const tokenOf = (res) => new URL(res.body.manageUrl).searchParams.get("t");

test("availability returns free start times and nothing else", async () => {
  await book("10:00");
  const res = await handle(req("GET", "/availability", { query: { date: TUESDAY, service: HAIRCUT.id } }), config);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["date", "serviceId", "starts"]);
  assert.ok(res.body.starts.every((s) => typeof s === "string" && !Number.isNaN(Date.parse(s))));
  assert.ok(!res.body.starts.includes(at(TUESDAY, "10:00").toISOString()));
  assert.ok(!res.body.starts.includes(at(TUESDAY, "10:30").toISOString()));
  assert.ok(res.body.starts.includes(at(TUESDAY, "10:45").toISOString()));
  assert.ok(!JSON.stringify(res.body).includes("Kai"));
});

test("a guest books, gets a manage link, and the diary keeps only the token's hash", async () => {
  const res = await book("10:00");
  assert.equal(res.status, 201);
  assert.equal(res.body.booking.serviceName, "Haircut");
  assert.equal(res.body.booking.priceCents, 5000);
  const token = tokenOf(res);
  assert.ok(Buffer.from(token, "base64url").length >= 32);

  const raw = await readFile(path.join(dir, "diary.json"), "utf8");
  assert.ok(!raw.includes(token));
  const stored = JSON.parse(raw).bookings[0];
  assert.equal(stored.customer.phone, "+61412345678");
  assert.equal(stored.manageTokenHash.length, 64);
  assert.equal(stored.endsAt, at(TUESDAY, "10:45").toISOString());

  // Confirmation to the guest with the link and an .ics; an alert to Vance.
  assert.equal(sent.length, 2);
  const [toGuest, toOwner] = sent;
  assert.equal(toGuest.to, "kai@example.com");
  assert.ok(toGuest.text.includes(res.body.manageUrl));
  assert.ok(toGuest.text.includes("41 Flowerdale Road"));
  assert.ok(toGuest.text.includes("PayID or cash"));
  assert.equal(toGuest.attachments[0].contentType, "text/calendar");
  assert.equal(toOwner.to, "vance@example.com");
  assert.ok(toOwner.text.includes("+61412345678"));
});

test("a booking stands with no mailer configured", async () => {
  config.mailer = null;
  const res = await book("10:00");
  assert.equal(res.status, 201);
});

test("the server re-checks every rule, whatever the client sent", async () => {
  assert.equal((await book("18:15")).body.code, "after-close");
  assert.equal((await book("10:10")).body.code, "outside-hours");
  assert.equal((await book("10:15")).body.code, "outside-hours"); // off the 45-minute grid
  assert.equal((await handle(req("POST", "/bookings", { body: { ...guest(), startsAt: at("2026-10-19", "08:00").toISOString() } }), config)).body.code, "past");
  assert.equal((await handle(req("POST", "/bookings", { body: { ...guest(), startsAt: at("2026-11-06", "10:00").toISOString() } }), config)).body.code, "closed");
  assert.equal((await handle(req("POST", "/bookings", { body: { ...guest(), serviceId: "nope" } }), config)).body.code, "bad-service");
  assert.equal((await book("10:00", { email: "" })).status, 400);
  // A client can't set its own status, price or source.
  const sneaky = await book("11:30", { status: "completed", priceCentsSnapshot: 1, source: "owner" });
  assert.equal(sneaky.status, 201);
  assert.equal(sneaky.body.booking.status, "confirmed");
  assert.equal(sneaky.body.booking.priceCents, 5000);
});

test("a second booking for the same slot gets a clean 'taken'", async () => {
  assert.equal((await book("10:00")).status, 201);
  const again = await book("10:00", { email: "b@example.com", phone: "0412000111" });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "taken");
});

test("two guests racing for one slot: exactly one is confirmed", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => book("14:30")));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.body.code === "taken"));
});

test("the manage token opens its own booking only", async () => {
  const res = await book("10:00");
  const { id } = res.body.booking;
  const token = tokenOf(res);
  const mine = await handle(req("GET", `/bookings/${id}`, { query: { t: token } }), config);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.canChange, true);
  assert.equal(mine.body.phone, undefined);

  assert.equal((await handle(req("GET", `/bookings/${id}`, { query: { t: "wrong" } }), config)).status, 404);
  assert.equal((await handle(req("GET", `/bookings/${id}`), config)).status, 404);
  const other = await book("12:15");
  assert.equal((await handle(req("GET", `/bookings/${other.body.booking.id}`, { query: { t: token } }), config)).status, 404);

  const ics = await handle(req("GET", `/bookings/${id}/ics`, { query: { t: token } }), config);
  assert.equal(ics.status, 200);
  assert.match(ics.raw, /BEGIN:VEVENT/);
  assert.match(ics.raw, /DTSTART:20261019T230000Z/);
});

test("a guest can cancel before the cutoff, which frees the slot", async (t) => {
  const res = await book("10:00");
  const { id } = res.body.booking;
  const token = tokenOf(res);
  sent = [];
  const out = await handle(req("POST", `/bookings/${id}/cancel`, { body: { t: token } }), config);
  assert.equal(out.status, 200);
  assert.equal(out.body.status, "cancelled");
  assert.ok(sent.some((m) => m.to === "kai@example.com" && /cancelled/i.test(m.subject)));
  assert.ok(sent.some((m) => m.to === "vance@example.com"));
  assert.equal((await book("10:00", { email: "other@example.com" })).status, 201);
  assert.equal((await handle(req("POST", `/bookings/${id}/cancel`, { body: { t: token } }), config)).status, 409);
});

test("inside 12 hours, cancel and reschedule refuse and point to Vance", async (t) => {
  const res = await book("12:15");
  const { id } = res.body.booking;
  const token = tokenOf(res);
  t.mock.timers.setTime(at(TUESDAY, "00:30").getTime());
  const cancel = await handle(req("POST", `/bookings/${id}/cancel`, { body: { t: token } }), config);
  assert.equal(cancel.status, 403);
  assert.equal(cancel.body.code, "cutoff");
  assert.match(cancel.body.error, /@vbarbersz/);
  const move = await handle(req("POST", `/bookings/${id}/reschedule`, { body: { t: token, startsAt: at(TUESDAY, "15:15").toISOString() } }), config);
  assert.equal(move.status, 403);
});

test("a guest can reschedule to a free time, checked like a new booking", async () => {
  const res = await book("10:00");
  await book("13:00", { email: "b@example.com", phone: "0412000111" });
  const { id } = res.body.booking;
  const token = tokenOf(res);
  const move = (hhmm) => handle(req("POST", `/bookings/${id}/reschedule`, { body: { t: token, startsAt: at(TUESDAY, hhmm).toISOString() } }), config);

  assert.equal((await move("13:00")).body.code, "taken");
  assert.equal((await move("18:15")).body.code, "after-close");
  assert.equal((await move("10:15")).body.code, "outside-hours"); // off the grid
  const ok = await move("10:45"); // ends 11:30, clear of 13:00
  assert.equal(ok.status, 200);
  assert.equal(ok.body.startsAt, at(TUESDAY, "10:45").toISOString());
  assert.equal(ok.body.endsAt, at(TUESDAY, "11:30").toISOString());
  assert.equal((await move("10:00")).status, 200); // and back into the slot it left
});

test("mutations must be JSON", async () => {
  const res = await handle(req("POST", "/bookings", { body: guest(), contentType: "application/x-www-form-urlencoded" }), config);
  assert.equal(res.status, 415);
});

// --- owner -------------------------------------------------------------------

async function signIn() {
  process.env.OWNER_PASSWORD_HASH = hashPassword("correct horse");
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
  const res = await handle(req("POST", "/owner/session", { body: { password: "correct horse" } }), config);
  assert.equal(res.status, 200);
  return res.headers["Set-Cookie"].split(";")[0];
}

test("owner routes refuse to work when sign-in isn't configured", async () => {
  const res = await handle(req("GET", "/owner/diary", { query: { from: TUESDAY, to: TUESDAY } }), config);
  assert.equal(res.status, 503);
});

test("in production, owner routes refuse without SESSION_SECRET", async () => {
  process.env.OWNER_PASSWORD_HASH = hashPassword("pw");
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = await handle(req("POST", "/owner/session", { body: { password: "pw" } }), config);
    assert.equal(res.status, 503);
  } finally {
    process.env.NODE_ENV = env;
  }
});

test("no owner data without a session; a wrong password is refused", async () => {
  process.env.OWNER_PASSWORD_HASH = hashPassword("correct horse");
  process.env.SESSION_SECRET = "s";
  assert.equal((await handle(req("GET", "/owner/diary", { query: { from: TUESDAY, to: TUESDAY } }), config)).status, 401);
  assert.equal((await handle(req("GET", "/owner/diary", { query: { from: TUESDAY, to: TUESDAY }, cookie: "vb_owner=forged.sig" }), config)).status, 401);
  assert.equal((await handle(req("POST", "/owner/session", { body: { password: "wrong" } }), config)).status, 401);
});

test("the owner sees the diary, cancels, blocks time and books by hand", async (t) => {
  let cookie = await signIn();
  const guestBooking = await book("10:00");

  const diary = await handle(req("GET", "/owner/diary", { query: { from: TUESDAY, to: TUESDAY }, cookie }), config);
  assert.equal(diary.status, 200);
  assert.equal(diary.body.bookings[0].customer.name, "Kai");
  assert.equal(diary.body.bookings[0].manageTokenHash, undefined);

  // A block over a booking is refused; elsewhere it stands and hides those slots.
  assert.equal((await handle(req("POST", "/owner/blocks", { body: { date: TUESDAY, from: "10:30", to: "11:00" }, cookie }), config)).status, 409);
  const block = await handle(req("POST", "/owner/blocks", { body: { date: TUESDAY, from: "13:00", to: "14:00", reason: "Lunch" }, cookie }), config);
  assert.equal(block.status, 201);
  assert.equal((await book("13:00", { email: "x@example.com" })).body.code, "blocked");

  // A manual booking may skip the notice period, and needs no email.
  t.mock.timers.setTime(at(TUESDAY, "10:30").getTime());
  cookie = await signIn(); // a day later, the first session has expired
  const manual = await handle(
    req("POST", "/owner/bookings", { body: { serviceId: HAIRCUT.id, startsAt: at("2026-10-20", "11:30").toISOString(), name: "Walk-in", phone: "0400 000 000" }, cookie }),
    config,
  );
  assert.equal(manual.status, 201);

  sent = [];
  const cancel = await handle(req("POST", `/owner/bookings/${guestBooking.body.booking.id}/cancel`, { body: {}, cookie }), config);
  assert.equal(cancel.status, 200);
  assert.ok(sent.some((m) => m.to === "kai@example.com" && /cancel/i.test(m.text)));

  assert.equal((await handle(req("DELETE", `/owner/blocks/${block.body.id}`, { body: {}, cookie }), config)).status, 200);
  assert.equal((await book("13:00", { email: "x@example.com" })).status, 201);
});
