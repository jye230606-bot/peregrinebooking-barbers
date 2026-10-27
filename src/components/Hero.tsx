"use client";

import { useEffect, useRef, useState } from "react";
import { area, tenant } from "@/config/tenant";
import { reviews } from "@/content/reviews";
import { money } from "./client-api";
import { openDays } from "./copy";
import { useTenant } from "./TenantContext";
import { Mark } from "./Mark";
import { onBookingClick } from "./BookingSheet";
import { scrollToEl, useIntroDone, useScrollVar, WordsReveal } from "./Motion";

/**
 * The top of the page: a floating bar, the shop and its suburb, the booking
 * button, and the shop's name set enormous with
 * electric-blue light breathing behind it. The light trails the
 * pointer, and the whole stage sinks and dims as the page scrolls.
 */

// The word set enormous at the foot of the hero: the shop, not the barber.
const HERO_WORD = "VBARBERS";

const melbourneClock = new Intl.DateTimeFormat("en-AU", {
  timeZone: tenant.timezone,
  hour: "numeric",
  minute: "2-digit",
});

function useClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(melbourneClock.format(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function TopBar() {
  const cfg = useTenant();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Tucks away while reading down, comes back on the way up.
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const el = ref.current;
      if (!el) return;
      if (y > last + 6 && y > 200) el.setAttribute("data-hidden", "");
      else if (y < last - 6 || y < 200) el.removeAttribute("data-hidden");
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className="vb-topbar">
      <a className="vb-brand" href="#top" aria-label={`${tenant.name}, back to top`} onClick={(e) => (e.preventDefault(), scrollToEl(document.body, 0))}>
        <Mark />
        <span>{tenant.name}</span>
      </a>
      <div className="vb-topbar-mid">
        <a href="#reviews" onClick={(e) => (e.preventDefault(), scrollToEl(document.getElementById("reviews"), 96))}>
          Reviews
        </a>
        <a href="#visit" onClick={(e) => (e.preventDefault(), scrollToEl(document.getElementById("visit"), 96))}>
          Hours &amp; location
        </a>
        <span className="vb-muted">
          {openDays("short", cfg)} · {tenant.address.locality}
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  const stage = useScrollVar("--hero-scroll", { from: "top", distance: 0.9 });
  const glow = useRef<HTMLDivElement>(null);
  const clock = useClock();
  const go = useIntroDone();
  const average = (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1);

  // The light follows the pointer, a little behind it.
  useEffect(() => {
    const el = glow.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover)").matches) return;
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      el.style.setProperty("--gx", x.toFixed(1));
      el.style.setProperty("--gy", y.toFixed(1));
      if (Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 160;
      ty = (e.clientY / window.innerHeight - 0.5) * 60;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header ref={stage as React.RefObject<HTMLElement>} className="vb-hero" id="top" data-go={go ? "" : undefined}>
      <div className="vb-hero-top">
        <WordsReveal
          as="h1"
          mode="intro"
          className="vb-hero-copy"
          parts={[{ text: `${tenant.name}, ${area()}`, muted: true }]}
        />
      </div>

      <HeroBooking />

      <div className="vb-hero-meta vb-hero-enter">
        <span>
          {area()}
          {clock && (
            <>
              {"  ·  "}
              <strong suppressHydrationWarning>{clock}</strong> Melbourne
            </>
          )}
        </span>
        <span>
          <strong>{average} ★</strong> · {reviews.length} reviews
        </span>
      </div>

      <div className="vb-hero-stage vb-hero-enter">
        <div ref={glow} className="vb-glow" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="vb-hero-word vb-hero-dim" aria-hidden="true">
          {HERO_WORD}
        </p>
        <p className="vb-hero-word vb-hero-lit" aria-hidden="true">
          {HERO_WORD}
        </p>
        <div className="vb-grain" aria-hidden="true" />
        <div className="vb-hero-fade" aria-hidden="true" />
      </div>
    </header>
  );
}

function HeroBooking() {
  const cfg = useTenant();
  return (
    <div className="vb-trim">
      <div className="vb-trim-lane">
        <span className="vb-trim-halo" aria-hidden="true" />
        <span className="vb-trim-edge" aria-hidden="true" />
        <a className="vb-trim-btn" href="#book" onClick={onBookingClick}>
          <span className="vb-trim-label">Make a Booking</span>
          <span className="vb-trim-arrow" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10h12M11 5l5 5-5 5" />
            </svg>
          </span>
        </a>
      </div>
      <p className="vb-trim-sub">
        {cfg.services.length} services from {money(Math.min(...cfg.services.map((s) => s.priceCents)))} · {openDays("short", cfg)}
      </p>
    </div>
  );
}
