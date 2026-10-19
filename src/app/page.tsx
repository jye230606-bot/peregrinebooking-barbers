import { BookingSheet } from "@/components/BookingSheet";
import { Hero, TopBar } from "@/components/Hero";
import { Info } from "@/components/Info";
import { Intro } from "@/components/Intro";
import { Profile } from "@/components/Profile";
import { Reviews } from "@/components/Reviews";

/**
 * The only public page: Vance's profile — everything his Booksy page says,
 * in his own light. Booking opens in a sheet when someone asks for it. No
 * pages to navigate to; it's where his Instagram bio link lands.
 */

// Rebuilt hourly, so past special dates fall off.
export const revalidate = 3600;

export default function Home() {
  return (
    <>
      <Intro />
      <TopBar />
      <main id="booking">
        <Hero />
        <Profile />
        <Reviews />
        <Info />
      </main>
      <BookingSheet />
    </>
  );
}
