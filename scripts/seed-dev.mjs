/**
 * Put a few fake bookings in the local file store so the time grid shows
 * taken slots. Local only: refuses unless STORE is "file" (or unset).
 *
 *   npm run seed:dev
 *
 * Bookings go on the next three open days, mid-afternoon, so they clear the
 * two-hour notice and are visible straight away. Re-running adds nothing new
 * where a slot is already taken.
 */
import nextEnv from "@next/env";
import path from "node:path";
import { tenant } from "../src/config/tenant.ts";
import { checkBooking, openingOn, spanOf } from "../src/booking/rules.ts";
import { at, shiftDays, todayKey } from "../src/booking/time.ts";
import { fileStore } from "../src/booking/server/fileStore.ts";
import { SlotTaken } from "../src/booking/server/store.ts";

nextEnv.loadEnvConfig(process.cwd());
if ((process.env.STORE ?? "file") !== "file") {
  console.error("seed:dev only writes to the local file store (STORE=file).");
  process.exit(1);
}

const file = process.env.STORE_FILE ?? path.join(process.cwd(), ".data", `${tenant.slug}.json`);
const store = fileStore(file);

const people = [
  { name: "Test Guest One", phone: "+61400000001", email: "guest1@example.com" },
  { name: "Test Guest Two", phone: "+61400000002", email: "guest2@example.com" },
  { name: "Test Guest Three", phone: "+61400000003", email: null },
];
const times = ["14:00", "15:00", "16:30"];

const days = [];
for (let k = shiftDays(todayKey(), 1); days.length < 3; k = shiftDays(k, 1)) if (openingOn(k)) days.push(k);

const now = new Date();
for (let i = 0; i < 3; i++) {
  const service = tenant.services[i % tenant.services.length];
  const start = at(days[i], times[i]);
  const range = { from: new Date(start.getTime() - 86_400_000).toISOString(), to: new Date(start.getTime() + 86_400_000).toISOString() };
  const ctx = { bookings: await store.listBookings(range), blocks: await store.listBlocks(range), now, actor: "owner" };
  const violation = checkBooking({ serviceId: service.id, startsAt: start.toISOString() }, ctx);
  if (violation) {
    console.log(`skip ${days[i]} ${times[i]}: ${violation.message}`);
    continue;
  }
  const span = spanOf(start, service);
  const stamp = now.toISOString();
  try {
    await store.insertBooking({
      id: crypto.randomUUID(),
      serviceId: service.id,
      startsAt: span.start.toISOString(),
      endsAt: span.end.toISOString(),
      blockedUntil: span.blockedUntil.toISOString(),
      status: "confirmed",
      priceCentsSnapshot: service.priceCents,
      customer: people[i],
      notes: "Fake booking from seed:dev",
      source: "owner",
      manageTokenHash: null,
      createdAt: stamp,
      updatedAt: stamp,
      cancelledAt: null,
    });
    console.log(`booked ${service.name} on ${days[i]} at ${times[i]}`);
  } catch (e) {
    if (e instanceof SlotTaken) console.log(`skip ${days[i]} ${times[i]}: taken`);
    else throw e;
  }
}
