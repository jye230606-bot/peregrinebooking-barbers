"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MarkPaths } from "./Mark";
import { tenant } from "@/config/tenant";
import { announceIntroDone } from "./Motion";

/**
 * The intro, ~2.2 s, once per session.
 *
 *   pool  0–950 ms     electric-blue liquid wells up from the bottom and
 *                      engulfs the mark and the name; under it, the type
 *                      reads black (a mask, not opacity)
 *   hold  950–1100 ms  the screen is all liquid; the black backdrop goes,
 *                      unseen, leaving the booking page behind the liquid
 *   lift  1100–2200 ms the liquid breaks into droplets that float up and
 *                      away, carrying the type, and the page shows through
 *
 * Gooeyness is an SVG filter (blur, then a hard alpha threshold) over plain
 * circles moved by requestAnimationFrame — no animation library, no WebGL.
 * If the filter is missing or the first frames are slow, it drops the filter
 * and the circles play as plain droplets. Any tap or key skips it; reduced
 * motion gets a 200 ms fade; a visitor who has seen it this session never
 * does again (see the flag script in layout.tsx).
 */

const KEY = "vb:intro";
const POOL_MS = 950;
const HOLD_MS = 150;
const LIFT_MS = 1100;
const TOTAL_MS = POOL_MS + HOLD_MS + LIFT_MS;
const SVG_NS = "http://www.w3.org/2000/svg";

// The composition: the mark (1040×1020 traced units) over VANCE, in its own
// coordinate box, scaled to fit any screen by the nested <svg>.
const COMP_VIEWBOX = "-50 -50 1500 1180";
const MARK_SCALE = 0.75;

function Composition() {
  return (
    <svg x="0" y="0" width="100%" height="100%" viewBox={COMP_VIEWBOX} preserveAspectRatio="xMidYMid meet" overflow="visible">
      <g transform={`translate(${(1400 - 1040 * MARK_SCALE) / 2} 0) scale(${MARK_SCALE})`}>
        <MarkPaths />
      </g>
      <text
        className="vb-intro-name"
        x="700"
        y="1080"
        fontSize="360"
        textAnchor="middle"
        textLength="1340"
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        {tenant.barber.toUpperCase()}
      </text>
    </svg>
  );
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t * t;

type Circle = { a: SVGCircleElement; b: SVGCircleElement };

function circlePair(liquid: SVGGElement, wet: SVGGElement): Circle {
  const a = document.createElementNS(SVG_NS, "circle");
  const b = document.createElementNS(SVG_NS, "circle");
  liquid.appendChild(a);
  wet.appendChild(b);
  return { a, b };
}

function place(c: Circle, cx: number, cy: number, r: number) {
  const x = cx.toFixed(1);
  const y = cy.toFixed(1);
  const rr = Math.max(0, r).toFixed(1);
  c.a.setAttribute("cx", x);
  c.a.setAttribute("cy", y);
  c.a.setAttribute("r", rr);
  c.b.setAttribute("cx", x);
  c.b.setAttribute("cy", y);
  c.b.setAttribute("r", rr);
}

export function Intro() {
  const [done, setDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const liquidRef = useRef<SVGGElement>(null);
  const wetRef = useRef<SVGGElement>(null);
  const dryTypeRef = useRef<SVGGElement>(null);
  const wetTypeRef = useRef<SVGGElement>(null);
  const finished = useRef(false);
  const seenRef = useRef<boolean | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    cleanup.current();
    document.getElementById("booking")?.removeAttribute("inert");
    setDone(true);
    announceIntroDone();
  }, []);

  useEffect(() => {
    // Decided once per mount, so a development double-run of this effect
    // doesn't read its own flag and skip.
    if (seenRef.current === null) {
      let seen = document.documentElement.getAttribute("data-intro") === "seen";
      try {
        seen = seen || sessionStorage.getItem(KEY) !== null;
        sessionStorage.setItem(KEY, "1");
      } catch {
        // Storage blocked: the intro plays, and may play again next visit.
      }
      seenRef.current = seen;
    }
    if (seenRef.current) {
      finish();
      return;
    }

    const root = rootRef.current!;
    const liquid = liquidRef.current!;
    const wet = wetRef.current!;
    const dryType = dryTypeRef.current!;
    const wetType = wetTypeRef.current!;
    document.getElementById("booking")?.setAttribute("inert", "");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear", fill: "forwards" });
      fade.onfinish = finish;
      cleanup.current = () => fade.cancel();
      return () => fade.cancel();
    }

    const w = root.clientWidth;
    const h = root.clientHeight;
    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    // Goo needs the filter primitives; if they're missing, play plain droplets.
    const gooFilter = typeof window.SVGFEColorMatrixElement !== "undefined";
    const setGoo = (on: boolean) => {
      for (const g of [liquid, wet]) {
        if (on) g.setAttribute("filter", "url(#vb-goo)");
        else g.removeAttribute("filter");
      }
    };
    setGoo(gooFilter);

    // Pool: a rising body with a lumpy, bobbing surface of blobs along its edge.
    const body = { a: document.createElementNS(SVG_NS, "rect"), b: document.createElementNS(SVG_NS, "rect") };
    liquid.appendChild(body.a);
    wet.appendChild(body.b);
    for (const r of [body.a, body.b]) {
      r.setAttribute("x", String(-60));
      r.setAttribute("width", String(w + 120));
    }
    const surfaceCount = Math.max(6, Math.ceil(w / 46));
    const surface = Array.from({ length: surfaceCount }, (_, i) => ({
      c: circlePair(liquid, wet),
      x: (i / (surfaceCount - 1)) * (w + 40) - 20,
      r: rand(22, 44),
      amp: rand(14, 46),
      freq: rand(0.006, 0.012),
      phase: rand(0, Math.PI * 2),
      // A few run ahead of the surface, stretch, and get swallowed again.
      lead: Math.random() < 0.25 ? rand(40, 110) : 0,
    }));

    // Lift: a grid of overlapping drops that reads as one sheet until it parts.
    const spacing = Math.min(110, Math.max(70, Math.min(w, h) / 5));
    const drops: { c: Circle; x: number; y: number; r: number; speed: number; delay: number; sway: number; phase: number }[] = [];
    for (let row = 0; row <= Math.ceil(h / spacing); row++) {
      for (let col = 0; col <= Math.ceil(w / spacing); col++) {
        const y = row * spacing + rand(-8, 8);
        drops.push({
          c: circlePair(liquid, wet),
          x: col * spacing + rand(-8, 8),
          y,
          r: spacing * 0.84,
          speed: rand(0.8, 1.6),
          // The bottom lets go first, as if the liquid drains upward.
          delay: clamp(1 - y / h) * 0.32 + rand(0, 0.06),
          sway: rand(4, 14),
          phase: rand(0, Math.PI * 2),
        });
      }
    }
    for (const d of drops) place(d.c, d.x, d.y, 0);

    let raf = 0;
    let start = 0;
    let last = 0;
    let frames = 0;
    let slow = 0;
    let lifted = false;

    const frame = (time: number) => {
      if (!start) start = last = time;
      const t = time - start;
      const dt = time - last;
      last = time;

      // Drop the filter if the first frames can't keep up.
      if (gooFilter && frames < 20) {
        frames++;
        if (frames > 3 && dt > 34) slow++;
        if (slow >= 6) setGoo(false);
      }

      if (t < POOL_MS + HOLD_MS) {
        const p = clamp(t / POOL_MS);
        const level = easeInOut(p) * (h + 140);
        const top = h - level;
        for (const r of [body.a, body.b]) {
          r.setAttribute("y", top.toFixed(1));
          r.setAttribute("height", (level + 60).toFixed(1));
        }
        for (const s of surface) {
          const bob = s.amp * (0.5 + 0.5 * Math.sin(t * s.freq + s.phase));
          const lead = s.lead * Math.sin(Math.PI * p);
          place(s.c, s.x, top + s.r * 0.4 - bob - lead, s.r * (1 + 0.25 * Math.sin(t * s.freq * 1.7 + s.phase)));
        }
      } else {
        if (!lifted) {
          lifted = true;
          // The screen is solid liquid now: swap the body for drops, unseen,
          // and let the page show through wherever they part.
          body.a.remove();
          body.b.remove();
          for (const s of surface) {
            s.c.a.remove();
            s.c.b.remove();
          }
          root.dataset.phase = "lift";
          // The page underneath starts arriving as the liquid lets go.
          announceIntroDone();
        }
        const u = clamp((t - POOL_MS - HOLD_MS) / LIFT_MS);
        for (const d of drops) {
          const v = clamp((u - d.delay) / (1 - d.delay));
          const travel = (d.y + d.r + 80) * d.speed;
          const cy = d.y - travel * easeIn(v);
          const cx = d.x + Math.sin(v * Math.PI * 1.5 + d.phase) * d.sway;
          place(d.c, cx, cy, d.r * (1 - 0.72 * v));
        }
        const lift = -h * 1.2 * easeIn(clamp((u - 0.08) / 0.92));
        dryType.setAttribute("transform", `translate(0 ${lift.toFixed(1)})`);
        wetType.setAttribute("transform", `translate(0 ${lift.toFixed(1)})`);
      }

      if (t >= TOTAL_MS) finish();
      else raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    cleanup.current = () => cancelAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(raf);
      liquid.replaceChildren();
      wet.replaceChildren();
      dryType.removeAttribute("transform");
      wetType.removeAttribute("transform");
      delete root.dataset.phase;
    };
  }, [finish]);

  if (done) return null;

  return (
    <div
      ref={rootRef}
      className="vb-intro"
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onPointerDown={finish}
      onKeyDown={finish}
    >
      <svg aria-hidden="true" focusable="false">
        <defs>
          <filter
            id="vb-goo"
            filterUnits="userSpaceOnUse"
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="11" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
          <mask id="vb-wet" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <g ref={wetRef} fill="#fff" />
          </mask>
        </defs>

        <g ref={dryTypeRef} style={{ color: "var(--intro-type)" }}>
          <Composition />
        </g>
        <g ref={liquidRef} style={{ fill: "var(--intro-liquid)" }} />
        <g mask="url(#vb-wet)">
          <g ref={wetTypeRef} style={{ color: "var(--intro-type-wet)" }}>
            <Composition />
          </g>
        </g>
      </svg>
    </div>
  );
}
