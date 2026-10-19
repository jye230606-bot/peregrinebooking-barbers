import test from "node:test";
import assert from "node:assert/strict";
import { tenant } from "../src/config/tenant.ts";
import {
  bookingWindow,
  checkBlock,
  checkBooking,
  checkDetails,
  freeStarts,
  gridStarts,
  guestCanChange,
  normalisePhone,
  openingOn,
} from "../src/booking/rules.ts";
import { at, shiftDays, timeLabel, shopDateKey } from "../src/booking/time.ts";

/**
 * The rules the diary holds however a write arrives. These run against the
 * module the API imports, so a rule that passes here is the rule the server
 * enforces. Clock times are written on Melbourne's wall clock via `at()`.
 * The rules take `now` from their context, so no clock is mocked here.
 */

const [HAIRCUT, BEARD] = tenant.services;
const TUESDAY = "2026-10-20";
const SATURDAY = "2026-10-24";
const NOW = at("2026-10-19", "09:00"); // a Monday morning, the day before

const ctx = (extra = {}) => ({ bookings: [], blocks: [], now: NOW, ...extra });
const iso = (key, hhmm) => at(key, hhmm).toISOString();
const check = (service, key, hhmm, extra = {}, cfg = tenant) =>
  checkBooking({ serviceId: service.id, startsAt: iso(key, hhmm) }, ctx(extra), cfg);
const labels = (dates) => dates.map((d) => timeLabel(d));

function booking(key, hhmm, service = HAIRCUT, extra = {}) {
  const start = at(key, hhmm);
  const end = new Date(start.getTime() + service.durationMin * 60_000);
  return {
    id: `b-${key}-${hhmm}`,
    serviceId: service.id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    blockedUntil: end.toISOString(),
    status: "confirmed",
    priceCentsSnapshot: service.priceCents,
    customer: { name: "Test", phone: "+61412345678", email: "t@example.com" },
    notes: null,
    source: "web",
    manageTokenHash: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    cancelledAt: null,
    ...extra,
  };
}

// --- hours and slot generation ------------------------------------------------

test("weekly hours are Booksy's: Sun/Mon closed, Tue–Fri 10:00–18:15, Sat 11:00–18:00", () => {
  assert.equal(openingOn("2026-10-18"), null); // Sunday
  assert.equal(openingOn("2026-10-19"), null); // Monday
  for (const day of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) {
    assert.deepEqual(openingOn(day), { open: "10:00", close: "18:15" });
  }
  assert.deepEqual(openingOn(SATURDAY), { open: "11:00", close: "18:00" });
});

test("slots run every 45 minutes, and the last one still ends by close", () => {
  const cuts = labels(gridStarts(TUESDAY, HAIRCUT));
  assert.deepEqual(cuts, ["10:00", "10:45", "11:30", "12:15", "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30"]);
  // 17:30 + 45 = 18:15, closing time: eleven set spots on a weekday.

  const beards = labels(gridStarts(TUESDAY, BEARD));
  assert.equal(beards.at(-1), "16:45"); // 17:30 + 60 would run past 18:15
  assert.equal(beards.length, 10);

  const saturday = labels(gridStarts(SATURDAY, HAIRCUT));
  assert.equal(saturday[0], "11:00");
  assert.equal(saturday.at(-1), "17:00"); // 17:00 + 45 = 17:45; 17:45 + 45 is past 18:00
  assert.equal(saturday.length, 9);
  assert.deepEqual(labels(gridStarts(SATURDAY, BEARD)).at(-1), "17:00"); // 17:00 + 60 = 18:00
});

test("closed days have no slots", () => {
  assert.deepEqual(gridStarts("2026-10-18", HAIRCUT), []);
  assert.deepEqual(gridStarts("2026-10-19", HAIRCUT), []);
  assert.equal(check(HAIRCUT, "2026-10-25", "11:00")?.code, "closed");
});

// --- end by close ------------------------------------------------------------

test("a booking must end by closing time", () => {
  assert.equal(check(HAIRCUT, TUESDAY, "17:30"), null);
  assert.equal(check(HAIRCUT, TUESDAY, "18:15")?.code, "after-close");
  assert.equal(check(BEARD, TUESDAY, "16:45"), null);
  assert.equal(check(BEARD, TUESDAY, "17:30")?.code, "after-close");
  assert.equal(check(HAIRCUT, SATURDAY, "17:00"), null);
  assert.equal(check(HAIRCUT, SATURDAY, "17:45")?.code, "after-close");
});

test("starts before opening, or off the 45-minute grid, are refused", () => {
  assert.equal(check(HAIRCUT, TUESDAY, "09:45")?.code, "outside-hours");
  assert.equal(check(HAIRCUT, SATURDAY, "10:45")?.code, "outside-hours");
  assert.equal(check(HAIRCUT, TUESDAY, "10:10")?.code, "outside-hours");
  assert.equal(check(HAIRCUT, TUESDAY, "10:15")?.code, "outside-hours");
  assert.equal(check(HAIRCUT, SATURDAY, "11:15")?.code, "outside-hours");
});

// --- past, notice, advance window ------------------------------------------------

test("past starts are refused, for the owner too", () => {
  const now = at(TUESDAY, "14:00");
  assert.equal(check(HAIRCUT, TUESDAY, "13:00", { now })?.code, "past");
  assert.equal(check(HAIRCUT, TUESDAY, "14:00", { now })?.code, "past");
  assert.equal(check(HAIRCUT, TUESDAY, "13:00", { now, actor: "owner" })?.code, "past");
});

test("guests need two hours' notice; the owner does not", () => {
  const now = at(TUESDAY, "10:00");
  assert.equal(check(HAIRCUT, TUESDAY, "11:30", { now })?.code, "too-soon");
  assert.equal(check(HAIRCUT, TUESDAY, "12:15", { now }), null);
  assert.equal(check(HAIRCUT, TUESDAY, "10:45", { now, actor: "owner" }), null);
  const free = labels(freeStarts(TUESDAY, HAIRCUT, ctx({ now })));
  assert.equal(free[0], "12:15");
});

test("guests can book six weeks ahead and no further; the owner can", () => {
  const window = bookingWindow(NOW);
  assert.equal(window[0], "2026-10-19");
  assert.equal(window.at(-1), "2026-11-30");
  assert.equal(window.length, 43);
  // 2026-11-28 is a Saturday inside the window; 2026-12-01 a Tuesday beyond it.
  assert.equal(check(HAIRCUT, "2026-11-28", "11:00"), null);
  assert.equal(check(HAIRCUT, "2026-12-01", "10:00")?.code, "too-far");
  assert.equal(check(HAIRCUT, "2026-12-01", "10:00", { actor: "owner" }), null);
});

// --- overrides ---------------------------------------------------------------

test("closed 5–9 November 2026, open again on the 10th", () => {
  for (const day of ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]) {
    assert.equal(openingOn(day), null, day);
    assert.deepEqual(gridStarts(day, HAIRCUT), [], day);
  }
  // Thursday and Friday the 5th and 6th, Saturday the 7th, would otherwise be open.
  assert.equal(check(HAIRCUT, "2026-11-05", "10:00")?.code, "closed");
  assert.equal(check(HAIRCUT, "2026-11-07", "11:00")?.code, "closed");
  assert.equal(check(HAIRCUT, "2026-11-10", "10:00"), null);
  assert.equal(check(HAIRCUT, "2026-11-04", "10:00"), null);
});

test("an override can open different hours instead of closing", () => {
  const cfg = { ...tenant, overrides: [{ date: TUESDAY, closed: false, open: "12:00", close: "14:00" }] };
  assert.equal(check(HAIRCUT, TUESDAY, "10:00", {}, cfg)?.code, "outside-hours");
  assert.equal(check(HAIRCUT, TUESDAY, "12:45", {}, cfg), null); // grid runs from the override's 12:00
  assert.equal(check(HAIRCUT, TUESDAY, "13:30", {}, cfg)?.code, "after-close");
});

// --- blocks and overlap --------------------------------------------------------

test("a block refuses any booking that overlaps it, and nothing either side", () => {
  const blocks = [{ id: "x", startsAt: iso(TUESDAY, "13:00"), endsAt: iso(TUESDAY, "14:00"), reason: "Lunch" }];
  assert.equal(check(HAIRCUT, TUESDAY, "12:15", { blocks }), null); // ends 13:00
  assert.equal(check(BEARD, TUESDAY, "12:15", { blocks })?.code, "blocked"); // runs to 13:15
  assert.equal(check(HAIRCUT, TUESDAY, "13:00", { blocks })?.code, "blocked");
  assert.equal(check(HAIRCUT, TUESDAY, "13:45", { blocks })?.code, "blocked");
  assert.equal(check(HAIRCUT, TUESDAY, "14:30", { blocks }), null);
  const free = labels(freeStarts(TUESDAY, HAIRCUT, ctx({ blocks })));
  assert.ok(!free.includes("13:00") && !free.includes("13:45"));
  assert.ok(free.includes("12:15") && free.includes("14:30"));
});

test("confirmed bookings can't overlap; cancelled ones free their slot", () => {
  const bookings = [booking(TUESDAY, "10:00")];
  assert.equal(check(HAIRCUT, TUESDAY, "10:00", { bookings })?.code, "taken");
  assert.equal(check(HAIRCUT, TUESDAY, "10:45", { bookings }), null); // starts as it ends

  // A 60-minute booking at 10:45 runs into one at 11:30, and holds the 11:30
  // spot from a haircut too.
  const later = [booking(TUESDAY, "11:30")];
  assert.equal(check(BEARD, TUESDAY, "10:45", { bookings: later })?.code, "taken");
  assert.equal(check(HAIRCUT, TUESDAY, "10:45", { bookings: later }), null); // ends 11:30 exactly
  const beard = [booking(TUESDAY, "10:00", BEARD)];
  assert.equal(check(HAIRCUT, TUESDAY, "10:45", { bookings: beard })?.code, "taken");
  assert.equal(check(HAIRCUT, TUESDAY, "11:30", { bookings: beard }), null);

  const cancelled = [booking(TUESDAY, "10:00", HAIRCUT, { status: "cancelled" })];
  assert.equal(check(HAIRCUT, TUESDAY, "10:00", { bookings: cancelled }), null);

  // Rescheduling a booking doesn't clash with itself.
  assert.equal(check(HAIRCUT, TUESDAY, "10:00", { bookings, ignoreId: bookings[0].id }), null);
});

test("the buffer, when set, keeps the next start clear", () => {
  const cfg = { ...tenant, rules: { ...tenant.rules, bufferMinutes: 15 } };
  const b = booking(TUESDAY, "10:00");
  b.blockedUntil = iso(TUESDAY, "11:00");
  assert.equal(check(HAIRCUT, TUESDAY, "10:45", { bookings: [b] }, cfg)?.code, "taken");
  assert.equal(check(HAIRCUT, TUESDAY, "11:30", { bookings: [b] }, cfg), null);
  // And the candidate's own buffer can't run into the next booking.
  const next = booking(TUESDAY, "12:15");
  assert.equal(check(HAIRCUT, TUESDAY, "11:30", { bookings: [next] }, cfg)?.code, "taken"); // held to 12:30
  assert.equal(check(HAIRCUT, TUESDAY, "10:45", { bookings: [next] }, cfg), null);
});

test("a block can't be laid over a confirmed booking", () => {
  const bookings = [booking(TUESDAY, "10:00")];
  assert.equal(checkBlock({ startsAt: iso(TUESDAY, "10:30"), endsAt: iso(TUESDAY, "11:00") }, bookings)?.code, "taken");
  assert.equal(checkBlock({ startsAt: iso(TUESDAY, "10:45"), endsAt: iso(TUESDAY, "11:00") }, bookings), null);
  assert.equal(checkBlock({ startsAt: iso(TUESDAY, "11:00"), endsAt: iso(TUESDAY, "11:00") }, bookings)?.code, "bad-time");
});

// --- daylight saving -------------------------------------------------------------

// Vance is closed on Sundays, which is exactly when Melbourne's clocks change. A
// copy of his config that opens on Sunday exercises the arithmetic on both days.
const sundays = { ...tenant, weeklyHours: [["09:00", "17:00"], ...tenant.weeklyHours.slice(1)] };

test("DST starts on the first Sunday of October (4 Oct 2026): 2am → 3am", () => {
  const day = "2026-10-04";
  const now = at("2026-10-01", "09:00");
  // AEST (+10) before, AEDT (+11) after.
  assert.equal(at("2026-10-03", "11:00").toISOString(), "2026-10-03T01:00:00.000Z");
  assert.equal(at(day, "01:30").toISOString(), "2026-10-03T15:30:00.000Z");
  assert.equal(at(day, "09:00").toISOString(), "2026-10-03T22:00:00.000Z");
  assert.equal(at("2026-10-06", "10:00").toISOString(), "2026-10-05T23:00:00.000Z");

  const slots = gridStarts(day, HAIRCUT, sundays);
  assert.equal(timeLabel(slots[0]), "09:00");
  assert.equal(timeLabel(slots.at(-1)), "15:45");
  assert.equal(slots.length, 10);
  for (let i = 1; i < slots.length; i++) assert.equal(slots[i] - slots[i - 1], 45 * 60_000);
  assert.ok(slots.every((s) => shopDateKey(s) === day));

  const c = { bookings: [], blocks: [], now };
  assert.equal(checkBooking({ serviceId: HAIRCUT.id, startsAt: at(day, "15:45").toISOString() }, c, sundays), null);
  assert.equal(checkBooking({ serviceId: HAIRCUT.id, startsAt: at(day, "16:30").toISOString() }, c, sundays)?.code, "after-close");
  // The real config is closed that Sunday.
  assert.equal(checkBooking({ serviceId: HAIRCUT.id, startsAt: at(day, "10:00").toISOString() }, c)?.code, "closed");
  // Saturday before and Tuesday after keep their wall-clock hours across the change.
  assert.equal(timeLabel(gridStarts("2026-10-03", HAIRCUT)[0]), "11:00");
  assert.equal(timeLabel(gridStarts("2026-10-06", HAIRCUT)[0]), "10:00");
  assert.equal(timeLabel(gridStarts("2026-10-06", HAIRCUT).at(-1)), "17:30");
});

test("DST ends on the first Sunday of April (4 Apr 2027): 3am → 2am", () => {
  const day = "2027-04-04";
  const now = at("2027-04-01", "09:00");
  assert.equal(at("2027-04-03", "11:00").toISOString(), "2027-04-03T00:00:00.000Z"); // AEDT +11
  assert.equal(at(day, "09:00").toISOString(), "2027-04-03T23:00:00.000Z"); // AEST +10
  assert.equal(at("2027-04-06", "10:00").toISOString(), "2027-04-06T00:00:00.000Z");

  const slots = gridStarts(day, HAIRCUT, sundays);
  assert.equal(timeLabel(slots[0]), "09:00");
  assert.equal(timeLabel(slots.at(-1)), "15:45");
  assert.equal(slots.length, 10);
  for (let i = 1; i < slots.length; i++) assert.equal(slots[i] - slots[i - 1], 45 * 60_000);

  const c = { bookings: [], blocks: [], now };
  assert.equal(checkBooking({ serviceId: BEARD.id, startsAt: at(day, "15:45").toISOString() }, c, sundays), null);
  assert.equal(checkBooking({ serviceId: BEARD.id, startsAt: at(day, "16:30").toISOString() }, c, sundays)?.code, "after-close");
  assert.equal(timeLabel(gridStarts("2027-04-03", HAIRCUT).at(-1)), "17:00");
  assert.equal(timeLabel(gridStarts("2027-04-06", BEARD).at(-1)), "16:45");
});

test("date keys and times are Melbourne's, whatever the instant's UTC date", () => {
  // 23:30 UTC on Monday is 10:30 Tuesday in Melbourne.
  const d = new Date("2026-10-19T23:30:00.000Z");
  assert.equal(shopDateKey(d), TUESDAY);
  assert.equal(timeLabel(d), "10:30");
  assert.equal(shiftDays("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDays("2026-10-04", 1), "2026-10-05");
});

// --- guest changes and details ---------------------------------------------------

test("a guest can change their booking until 12 hours before it", () => {
  const b = booking(TUESDAY, "12:00");
  assert.equal(guestCanChange(b, at("2026-10-19", "23:59")), true);
  assert.equal(guestCanChange(b, at(TUESDAY, "00:00")), true); // exactly 12h
  assert.equal(guestCanChange(b, at(TUESDAY, "00:01")), false);
  assert.equal(guestCanChange({ ...b, status: "cancelled" }, NOW), false);
});

test("phones normalise to E.164 (+61)", () => {
  assert.equal(normalisePhone("0412 345 678"), "+61412345678");
  assert.equal(normalisePhone("+61 412 345 678"), "+61412345678");
  assert.equal(normalisePhone("61412345678"), "+61412345678");
  assert.equal(normalisePhone("(03) 9555 1234"), "+61395551234");
  assert.equal(normalisePhone("+64 21 123 4567"), "+64211234567");
  assert.equal(normalisePhone("0412 345"), null);
  assert.equal(normalisePhone("call me"), null);
  assert.equal(normalisePhone("+61 012 345 678"), null);
});

test("guest details are trimmed, capped and required", () => {
  const ok = checkDetails({ name: "  Kai ", phone: "0412345678", email: " KAI@Example.com ", notes: "" }, { requireEmail: true });
  assert.deepEqual(ok, { ok: true, details: { name: "Kai", phone: "+61412345678", email: "kai@example.com", notes: null } });
  assert.equal(checkDetails({ name: "", phone: "0412345678", email: "a@b.co" }, { requireEmail: true }).ok, false);
  assert.equal(checkDetails({ name: "Kai", phone: "0412345678", email: "" }, { requireEmail: true }).ok, false);
  assert.equal(checkDetails({ name: "Kai", phone: "0412345678", email: "" }, { requireEmail: false }).ok, true);
  assert.equal(checkDetails({ name: "Kai", phone: "0412345678", email: "nope" }, { requireEmail: false }).ok, false);
  const long = checkDetails({ name: "x".repeat(500), phone: "0412345678", email: "a@b.co" }, { requireEmail: true });
  assert.equal(long.details.name.length, 80);
});
