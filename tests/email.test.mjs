import test from "node:test";
import assert from "node:assert/strict";
import { messagesFor } from "../src/booking/server/email.ts";
import { tenant } from "../src/config/tenant.ts";
import { at } from "../src/booking/time.ts";

/**
 * The booking emails, modelled on what clients get from Booksy: the shop up
 * top, a headline, a card of the details, big buttons, the policy, a footer.
 */

const [HAIRCUT] = tenant.services;
const start = at("2026-10-21", "10:45");
const end = new Date(start.getTime() + 45 * 60_000);
const booking = {
  id: "11111111-1111-4111-8111-111111111111",
  serviceId: HAIRCUT.id,
  startsAt: start.toISOString(),
  endsAt: end.toISOString(),
  blockedUntil: end.toISOString(),
  status: "confirmed",
  priceCentsSnapshot: 5000,
  customer: { name: "Kai <script>", phone: "+61412345678", email: "kai@example.com" },
  notes: "Skin fade please",
  source: "web",
  manageTokenHash: null,
  createdAt: start.toISOString(),
  updatedAt: start.toISOString(),
  cancelledAt: null,
};
const opts = { manageUrl: "https://vbarbers.peregrinepartners.space/booking/1?t=abc", ownerEmail: "vance@example.com", siteUrl: "https://vbarbers.peregrinepartners.space" };
const [guest, owner] = messagesFor("created", booking, opts);

test("the client's confirmation reads like a booking app's", () => {
  assert.equal(guest.subject, "You're booked: Haircut, Wed 21 Oct at 10:45");
  assert.match(guest.html, /You&#39;re booked in/);
  for (const bit of ["Haircut", "Wednesday 21 October", "10:45 – 11:30", "Vance", "$50", "41 Flowerdale Road, Hampton East VIC 3188", "card or cash"]) {
    assert.ok(guest.html.includes(bit), bit);
  }
  assert.match(guest.html, /href="https:\/\/vbarbers\.peregrinepartners\.space\/booking\/1\?t=abc"[^>]*>Change or cancel/);
  assert.match(guest.html, /maps\/search/);
  assert.match(guest.html, /12 hours/);
  assert.match(guest.html, /<table/); // email clients need tables, not flex
  assert.equal(guest.attachments[0].filename, "v-barbers-booking.ics");
});

test("the client's name is escaped, not trusted", () => {
  assert.doesNotMatch(guest.html, /<script>/);
  assert.doesNotMatch(owner.html, /<script>/);
  assert.match(owner.html, /Kai &lt;script&gt;/);
});

test("a hidden preheader gives the inbox a useful preview line", () => {
  assert.match(guest.html, /display:none[^>]*>Haircut with Vance, Wednesday 21 October at 10:45/);
});

test("Vance's alert is a card he can act on", () => {
  assert.equal(owner.subject, "New booking: Kai <script>, Haircut, Wed 21 Oct at 10:45");
  assert.match(owner.html, /New booking/);
  assert.match(owner.html, /href="tel:\+61412345678"/);
  assert.match(owner.html, /href="mailto:kai@example\.com"/);
  assert.match(owner.html, /Skin fade please/);
  assert.match(owner.html, /href="https:\/\/www\.peregrineoffice\.space\/console\/shop\/vbarbers\?date=2026-10-21"[^>]*>Open calendar/);
  assert.match(owner.text, /Kai <script>/);
});

test("a cancellation says so and offers to book again", () => {
  const [g, o] = messagesFor("cancelled-by-guest", booking, opts);
  assert.equal(g.subject, "Cancelled: Haircut, Wed 21 Oct at 10:45");
  assert.match(g.html, /href="https:\/\/vbarbers\.peregrinepartners\.space"[^>]*>Book again/);
  assert.equal(o.subject, "Cancelled: Kai <script>, Haircut, Wed 21 Oct at 10:45");
});

test("every message has a plain-text version", () => {
  for (const m of [guest, owner, ...messagesFor("cancelled-by-owner", booking, opts), ...messagesFor("rescheduled", booking, opts)]) {
    assert.ok(m.text.length > 40, m.subject);
    assert.doesNotMatch(m.text, /<(table|td|p|a|div|h1)\b/);
  }
});

test("Cloudflare sending is used only where the Worker says so", async () => {
  const { cloudflareMailer, mailerFromEnv, parseAddress } = await import("../src/booking/server/email.ts");
  assert.equal(cloudflareMailer({ BOOKING_FROM_EMAIL: "V Barbers <bookings@x.space>" }), null);
  assert.ok(cloudflareMailer({ EMAIL_PROVIDER: "cloudflare", BOOKING_FROM_EMAIL: "V Barbers <bookings@x.space>" }));
  assert.equal(mailerFromEnv({}), null);
  assert.deepEqual(parseAddress("V Barbers <bookings@x.space>"), { email: "bookings@x.space", name: "V Barbers" });
});
