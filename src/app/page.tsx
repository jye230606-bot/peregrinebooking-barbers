import { config, tenantConfig } from "@/booking/server/config";
import { BookingSheet } from "@/components/BookingSheet";
import { Hero, TopBar } from "@/components/Hero";
import { Info } from "@/components/Info";
import { Intro } from "@/components/Intro";
import { Profile } from "@/components/Profile";
import { Reviews } from "@/components/Reviews";
import { TenantProvider } from "@/components/TenantContext";

/**
 * The only public page: Vance's profile — everything his Booksy page says,
 * in his own light. Booking opens in a sheet when someone asks for it. No
 * pages to navigate to; it's where his Instagram bio link lands.
 */

// Rebuilt every minute, so hours and days off Vance changes show quickly.
export const revalidate = 60;

export default async function Home() {
  const cfg = await tenantConfig(config().store);
  return (
    <TenantProvider value={cfg}>
      <Intro />
      <TopBar />
      <main id="booking">
        <Hero />
        <Profile />
        <Reviews />
        <Info />
      </main>
      <BookingSheet />
    </TenantProvider>
  );
}
