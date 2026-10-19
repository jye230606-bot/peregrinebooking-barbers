"use client";

import { useEffect, useRef, useState } from "react";
import { fullAddress, tenant } from "@/config/tenant";
import { reviews } from "@/content/reviews";
import { money } from "./client-api";
import { openDays } from "./copy";
import { Mark } from "./Mark";
import { openBooking } from "./BookingSheet";
import { scrollToEl, useIntroDone, useScrollVar, WordsReveal } from "./Motion";

/**
 * The top of the page: a floating bar, the name and address, a trimmer that
 * buzzes across to reveal the booking button, and his name set enormous with
 * electric-blue light breathing behind it. The light trails the
 * pointer, and the whole stage sinks and dims as the page scrolls.
 */

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
          {openDays("short")} · {tenant.address.locality}
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
          parts={[
            { text: `${tenant.booksyName} ` },
            { text: fullAddress(), muted: true },
          ]}
        />
      </div>

      <TrimReveal />

      <div className="vb-hero-meta vb-hero-enter">
        <span>
          {tenant.address.locality}, {tenant.address.region}
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
          {tenant.barber.toUpperCase()}
        </p>
        <p className="vb-hero-word vb-hero-lit" aria-hidden="true">
          {tenant.barber.toUpperCase()}
        </p>
        <div className="vb-grain" aria-hidden="true" />
        <div className="vb-hero-fade" aria-hidden="true" />
      </div>
    </header>
  );
}

/**
 * A trimmer passes left to right and the "Make a Booking" button is left in
 * its wake. Once it's cut, a blue edge runs round it and a halo pulses out, so
 * it's the one thing on the page asking to be pressed.
 *
 * Every moving part animates only transform and opacity, so phones run it on
 * the GPU: the trimmer's track spans the lane (so translateX percentages are
 * lane-relative), a black cover shrinks off the button instead of a clip-path,
 * and the blue edge is a conic gradient that rotates rather than repaints. The
 * cover, guide and trimmer share one timeline, so the cut edge stays under the
 * blade. Without JS or with reduced motion the button is simply there.
 */
function TrimReveal() {
  return (
    <div className="vb-trim">
      <div className="vb-trim-lane">
        <span className="vb-trim-guide" aria-hidden="true" />
        <span className="vb-trim-halo" aria-hidden="true" />
        <span className="vb-trim-edge" aria-hidden="true" />
        <button type="button" className="vb-trim-btn" onClick={() => openBooking()}>
          <span className="vb-trim-label">Make a Booking</span>
          <span className="vb-trim-arrow" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10h12M11 5l5 5-5 5" />
            </svg>
          </span>
        </button>
        <span className="vb-trim-cover" aria-hidden="true" />
        <span className="vb-trimmer" aria-hidden="true">
          <span className="vb-trimmer-body">
            <Trimmer />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>
      <p className="vb-trim-sub">
        {tenant.services.length} services from {money(Math.min(...tenant.services.map((s) => s.priceCents)))} · {openDays("short")}
      </p>
    </div>
  );
}

function Trimmer() {
  return (
    <svg viewBox="0 0 160 56" width="160" height="56">
      <defs>
        <linearGradient id="vb-trim-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--vb-surface-3)" />
          <stop offset="0.5" stopColor="var(--vb-surface)" />
          <stop offset="1" stopColor="var(--vb-black)" />
        </linearGradient>
        <linearGradient id="vb-trim-blade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--vb-white)" />
          <stop offset="0.5" stopColor="var(--vb-grey)" />
          <stop offset="1" stopColor="var(--vb-white)" />
        </linearGradient>
      </defs>
      {/* cord */}
      <path d="M2 28 C 10 28, 12 20, 22 22" fill="none" stroke="var(--vb-surface-3)" strokeWidth="3" strokeLinecap="round" />
      {/* body */}
      <rect x="18" y="10" width="112" height="36" rx="18" fill="url(#vb-trim-body)" stroke="var(--vb-surface-3)" strokeWidth="1" />
      <rect x="30" y="14" width="80" height="4" rx="2" fill="var(--vb-white)" opacity="0.08" />
      {/* grip ridges */}
      {[40, 48, 56, 64].map((x) => (
        <rect key={x} x={x} y="30" width="3" height="10" rx="1.5" fill="var(--vb-black)" opacity="0.6" />
      ))}
      {/* power light */}
      <circle cx="90" cy="35" r="3" fill="var(--c-accent)" />
      <circle cx="90" cy="35" r="7" fill="var(--c-accent)" opacity="0.25" />
      {/* blade housing */}
      <path d="M126 12 h12 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 h-12 z" fill="var(--vb-surface-2)" stroke="var(--vb-surface-3)" strokeWidth="1" />
      <rect x="142" y="8" width="6" height="40" rx="1.5" fill="url(#vb-trim-blade)" />
      {/* teeth */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x="148" y={9 + i * 4.4} width="5" height="2.4" rx="1" fill="var(--vb-white)" />
      ))}
    </svg>
  );
}
