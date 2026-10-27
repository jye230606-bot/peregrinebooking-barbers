"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mark } from "./Mark";
import { announceIntroDone } from "./Motion";

/** Blue logo preface, then the page slides up over it. Once per session. */
const KEY = "vb:intro";

export function Intro({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"hold" | "slide" | "done">("hold");
  const seen = useRef<boolean | null>(null);
  const finished = useRef(false);
  const active = phase !== "done";

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase("done");
    announceIntroDone();
  }, []);

  useEffect(() => {
    // Keep the first decision through development's effect replay.
    if (seen.current === null) {
      seen.current = document.documentElement.getAttribute("data-intro") === "seen";
      try {
        seen.current = seen.current || sessionStorage.getItem(KEY) !== null;
        sessionStorage.setItem(KEY, "1");
      } catch {
        // With storage blocked, the intro can play again on a later visit.
      }
    }
    if (seen.current || window.location.hash.split("?")[0] === "#book" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    const start = window.setTimeout(() => {
      if (finished.current) return;
      announceIntroDone();
      setPhase("slide");
    }, 1200);
    // Also release the page if styles or an animation-end event are unavailable.
    const fallback = window.setTimeout(finish, 2000);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(fallback);
    };
  }, [finish]);

  useEffect(() => {
    // Once the landing page starts to appear, its visible controls must work.
    if (phase !== "hold") return;
    const page = document.getElementById("booking");
    page?.setAttribute("inert", "");
    return () => {
      page?.removeAttribute("inert");
    };
  }, [phase]);

  useEffect(() => {
    if (!active) return;
    const onBooking = () => {
      if (window.location.hash.split("?")[0] === "#book") finish();
    };
    window.addEventListener("hashchange", onBooking);
    return () => window.removeEventListener("hashchange", onBooking);
  }, [active, finish]);

  return (
    <div className="vb-entry" data-phase={phase}>
      {active && (
        <button type="button" className="vb-intro" aria-label="Skip intro" onClick={finish}>
          <Mark />
        </button>
      )}
      <div
        className="vb-entry-page"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) finish();
        }}
      >
        {children}
      </div>
    </div>
  );
}
