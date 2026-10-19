import type { Metadata } from "next";
import { cookies } from "next/headers";
import { tenant } from "@/config/tenant";
import { COOKIE, isOwner, ownerAuth } from "@/booking/server/auth";
import { todayKey } from "@/booking/time";
import { OwnerConsole, OwnerSignIn } from "@/components/Owner";

/**
 * Vance's diary: sign in, see the day or the week, cancel, block time, take a
 * booking by hand. A stopgap until the Peregrine portal reads the same data.
 * The session is checked here, on the server, before any of it renders.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Owner · ${tenant.name}`,
  robots: { index: false, follow: false },
};

export default async function OwnerPage() {
  const auth = ownerAuth();
  const jar = await cookies();
  const session = jar.get(COOKIE)?.value;
  const signedIn = session ? isOwner(`${COOKIE}=${session}`) : false;
  const feedSecret = process.env.CALENDAR_FEED_SECRET;

  return (
    <main className="vb-page">
      <header className="vb-block vb-row">
        <h1 className="vb-display vb-title" style={{ margin: 0 }}>
          {tenant.name}
        </h1>
        <span className="vb-label">Owner</span>
      </header>
      {!auth || !auth.passwordHash ? (
        <p className="vb-notice">
          Owner sign-in is not configured. Set OWNER_PASSWORD_HASH and SESSION_SECRET, then restart.
        </p>
      ) : signedIn ? (
        <OwnerConsole today={todayKey()} feedPath={feedSecret ? `/api/calendar/${feedSecret}.ics` : null} />
      ) : (
        <OwnerSignIn />
      )}
    </main>
  );
}
