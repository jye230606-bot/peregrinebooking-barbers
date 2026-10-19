"use client";

import { createElement, useEffect, useRef, useState } from "react";

/**
 * The page's motion, without a library: one shared scroll loop, CSS variables
 * written per frame, and every curve from the tokens. Each piece stands down
 * under prefers-reduced-motion (the stylesheet also flattens it).
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- the hand-over from the intro --------------------------------------------

declare global {
  interface Window {
    __vbIntroDone?: boolean;
  }
}

/** Called by the intro when it's gone (or was never going to play). */
export function announceIntroDone() {
  window.__vbIntroDone = true;
  window.dispatchEvent(new Event("vb:intro-done"));
}

/** True once the intro has handed the page over. */
export function useIntroDone() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (window.__vbIntroDone) return setDone(true);
    const on = () => setDone(true);
    window.addEventListener("vb:intro-done", on);
    return () => window.removeEventListener("vb:intro-done", on);
  }, []);
  return done;
}

// --- one scroll loop for everything ------------------------------------------

type Tick = () => void;
const ticks = new Set<Tick>();
let queued = false;

function run() {
  queued = false;
  for (const t of ticks) t();
}

function onScroll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}

function subscribe(tick: Tick) {
  if (ticks.size === 0) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }
  ticks.add(tick);
  tick();
  return () => {
    ticks.delete(tick);
    if (ticks.size === 0) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// --- block reveal --------------------------------------------------------------

/** Rises, sharpens and fades in the first time it scrolls into view. */
export function Reveal({
  children,
  as = "div",
  className = "",
  index = 0,
  ...rest
}: {
  children: React.ReactNode;
  as?: string;
  className?: string;
  index?: number;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-shown", "");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.setAttribute("data-shown", "");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return createElement(
    as,
    { ref, className: `vb-reveal ${className}`, style: { "--i": index } as React.CSSProperties, ...rest },
    children,
  );
}

// --- words coming into focus ---------------------------------------------------

export type Part = { text: string; muted?: boolean };

/**
 * A heading whose words blur into focus one after another as it scrolls up
 * the screen — the reading follows the scroll. Muted parts settle grey.
 */
export function WordsReveal({
  parts,
  as = "h2",
  className = "",
  id,
  mode = "scroll",
}: {
  parts: Part[];
  as?: string;
  className?: string;
  id?: string;
  /** "scroll": focus follows the scroll. "intro": the words rise in once, when the intro hands over. */
  mode?: "scroll" | "intro";
}) {
  const ref = useRef<HTMLElement>(null);
  const introDone = useIntroDone();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || mode !== "scroll") return;
    const words = Array.from(el.querySelectorAll<HTMLElement>(".vb-word"));
    const n = words.length;
    return subscribe(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the heading's top is at 95% of the screen, 1 by 45%.
      const p = clamp((vh * 0.95 - rect.top) / (vh * 0.5));
      const spread = p * (n + 3);
      for (let i = 0; i < n; i++) {
        words[i].style.setProperty("--w", clamp((spread - i) / 3).toFixed(3));
      }
    });
  }, [mode]);

  const words: { text: string; muted?: boolean }[] = [];
  for (const part of parts) {
    for (const w of part.text.split(/(?<=\s)/)) if (w) words.push({ text: w, muted: part.muted });
  }

  const intro = mode === "intro";
  return createElement(
    as,
    {
      ref,
      className: `${className}${intro && !introDone ? " vb-await" : ""}`,
      id,
      "aria-label": parts.map((p) => p.text).join(""),
    },
    words.map((w, i) => (
      <span
        key={i}
        aria-hidden="true"
        className={`vb-word${w.muted ? " vb-muted" : ""}${intro && introDone ? " vb-rise" : ""}`}
        style={(intro ? { "--w": 1, "--i": i * 2.2 } : { "--w": 0 }) as unknown as React.CSSProperties}
      >
        {w.text}
      </span>
    )),
  );
}

// --- scroll-linked variable ----------------------------------------------------

/** Writes `--name` (0→1) to the element as it scrolls from `start` to `end` viewport-heights. */
export function useScrollVar(name: string, opts: { from?: "top" | "enter"; distance?: number } = {}) {
  const ref = useRef<HTMLElement>(null);
  const { from = "top", distance = 1 } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    return subscribe(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = from === "top" ? -rect.top / (vh * distance) : (vh - rect.top) / ((vh + rect.height) * distance);
      el.style.setProperty(name, clamp(p).toFixed(4));
    });
  }, [name, from, distance]);
  return ref;
}

// --- eased scroll ----------------------------------------------------------------

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  // Solve the curve for t at x by Newton's method, then read y.
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (xAt(t) - x) / d;
    }
    return yAt(clamp(t));
  };
};

/** The tokens' --ease-in-out, for travel. */
const travel = bezier(0.65, 0, 0.35, 1);

/**
 * Scroll to an element along the in-out curve — inside the nearest
 * `[data-scroller]` panel if there is one, else the page. Any wheel or touch
 * hands control back.
 */
export function scrollToEl(el: Element | null, offset = 16) {
  if (!el) return;
  const panel = el.closest<HTMLElement>("[data-scroller]");
  const getY = () => (panel ? panel.scrollTop : window.scrollY);
  const setY = (y: number) => (panel ? (panel.scrollTop = y) : window.scrollTo(0, y));
  const top = panel ? panel.getBoundingClientRect().top : 0;
  const target = el.getBoundingClientRect().top - top + getY() - offset;
  if (reduced()) {
    setY(target);
    return;
  }
  const start = getY();
  const distance = target - start;
  const duration = Math.min(1400, 500 + Math.abs(distance) * 0.35);
  let t0 = 0;
  let cancelled = false;
  const cancel = () => (cancelled = true);
  window.addEventListener("wheel", cancel, { once: true, passive: true });
  window.addEventListener("touchstart", cancel, { once: true, passive: true });
  const step = (now: number) => {
    if (cancelled) return;
    if (!t0) t0 = now;
    const p = clamp((now - t0) / duration);
    setY(start + distance * travel(p));
    if (p < 1) requestAnimationFrame(step);
    else {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
    }
  };
  requestAnimationFrame(step);
}

// --- parallax photo --------------------------------------------------------------

/** A photo that drifts against the scroll inside its frame. */
export function ParallaxPhoto(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useScrollVar("--parallax", { from: "enter" });
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref as React.RefObject<HTMLImageElement>} className="vb-photo" loading="lazy" decoding="async" {...props} alt={props.alt ?? ""} />;
}
