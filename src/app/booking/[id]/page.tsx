import type { Metadata } from "next";
import { tenant } from "@/config/tenant";
import { config, tenantConfig } from "@/booking/server/config";
import { guestBooking, guestView } from "@/booking/server/api";
import { ManageBooking } from "@/components/ManageBooking";
import { Mark } from "@/components/Mark";

/**
 * A guest's own booking, opened from the link in their confirmation. The
 * token is checked on the server before anything renders; a wrong token and
 * a missing booking look identical.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Your booking · ${tenant.name}`,
  robots: { index: false, follow: false },
  // The URL carries the guest's token; never send it on to another site.
  referrer: "no-referrer",
};

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const { store } = config();
  const [booking, cfg] = await Promise.all([guestBooking(store, id, token), tenantConfig(store)]);

  return (
    <main className="vb-page">
      <header className="vb-block vb-head">
        <Mark className="vb-mark" />
        <div>
          <p className="vb-label" style={{ margin: 0 }}>
            Your booking
          </p>
          <h1 className="vb-hero-name" style={{ margin: 0 }}>
            {tenant.barber}
          </h1>
        </div>
      </header>
      {booking ? (
        <ManageBooking initial={guestView(booking, new Date(), cfg)} token={token} />
      ) : (
        <section className="vb-block vb-stack">
          <p className="vb-notice" style={{ margin: 0 }}>
            This link doesn’t match a booking. Check you opened the whole link from your confirmation email.
          </p>
          <a className="vb-btn vb-btn-center vb-label" href="/">
            Make a booking
          </a>
        </section>
      )}
    </main>
  );
}
