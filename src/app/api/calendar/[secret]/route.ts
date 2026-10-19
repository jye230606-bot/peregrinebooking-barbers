import { config } from "@/booking/server/config";
import { feedIcs } from "@/booking/ics";
import { secretMatches } from "@/booking/server/tokens";

/**
 * Vance's read-only calendar feed: /api/calendar/<CALENDAR_FEED_SECRET>.ics.
 * Subscribe to it from Apple or Google Calendar. It carries customers' names
 * and numbers, so the secret is the only key — long, random, never in the repo.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export async function GET(_request: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const given = secret.replace(/\.ics$/, "");
  if (!secretMatches(given, process.env.CALENDAR_FEED_SECRET)) {
    return new Response("Not found", { status: 404 });
  }

  const now = Date.now();
  const bookings = await config().store.listBookings({
    from: new Date(now - 30 * DAY).toISOString(),
    to: new Date(now + 120 * DAY).toISOString(),
  });

  return new Response(feedIcs(bookings), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bookings.ics"',
      "Cache-Control": "no-store",
    },
  });
}
