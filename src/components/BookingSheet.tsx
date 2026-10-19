"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookingFlow } from "./BookingFlow";
import { Mark } from "./Mark";

/**
 * Booking lives in a sheet that rises over the profile only when someone asks
 * for it — a Book button on a service, or the one in the top bar. The page
 * itself stays a place to look around.
 *
 * Opened from anywhere with `openBooking(serviceId?)`. Escape, the close
 * button or a tap on the backdrop puts it away; the page behind doesn't
 * scroll while it's up.
 */

const EVENT = "vb:book";

export function openBooking(serviceId?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { serviceId } }));
}

type State = "closed" | "open" | "closing";

export function BookingSheet() {
  const [state, setState] = useState<State>("closed");
  const [serviceId, setServiceId] = useState<string | undefined>();
  const [session, setSession] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setState((s) => (s === "open" ? "closing" : s));
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ serviceId?: string }>).detail?.serviceId;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setServiceId(id);
      setSession((n) => n + 1); // a fresh flow each time it opens
      setState("open");
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (state !== "open") return;
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    html.style.paddingRight = `${scrollbar}px`;
    document.getElementById("booking")?.setAttribute("inert", "");
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = "";
      html.style.paddingRight = "";
      document.getElementById("booking")?.removeAttribute("inert");
    };
  }, [state, close]);

  // After the exit animation, unmount and hand focus back.
  const onAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget || state !== "closing") return;
    setState("closed");
    returnFocus.current?.focus?.({ preventScroll: true });
  };

  if (state === "closed") return null;

  return (
    <div className="vb-sheet" data-state={state}>
      <div className="vb-sheet-backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        className="vb-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Book"
        tabIndex={-1}
        data-scroller=""
        onAnimationEnd={onAnimationEnd}
      >
        <div className="vb-sheet-head">
          <span className="vb-brand">
            <Mark />
            <span>Book</span>
          </span>
          <button type="button" className="vb-sheet-close" onClick={close} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <div className="vb-sheet-body">
          <BookingFlow key={session} initialServiceId={serviceId} onDone={close} />
        </div>
      </div>
    </div>
  );
}
