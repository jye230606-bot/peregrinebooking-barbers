"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookingFlow } from "./BookingFlow";
import { Mark } from "./Mark";
import { area, tenant } from "@/config/tenant";

/**
 * Booking rises as a full page over the landing page,
 * with the original rounded controls, palette and typography.
 *
 * Native #book links preserve opening intent even before React hydrates.
 * Back and Escape reverse the transition. The overlay is rendered at the body
 * so the landing page's animation cannot contain or obscure it.
 */

const OPEN_EVENT = "vb:booking-request";

function bookingRequest() {
  const [name, query] = window.location.hash.split("?");
  return name === "#book" ? { serviceId: new URLSearchParams(query).get("service") ?? undefined } : null;
}

export function openBooking(serviceId?: string) {
  window.location.hash = serviceId ? `book?service=${encodeURIComponent(serviceId)}` : "book";
  // An explicit tap must also work when the hash is already #book.
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onBookingClick(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openBooking();
}

type State = "closed" | "open" | "closing";

export function BookingSheet() {
  const [state, setState] = useState<State>("closed");
  const [serviceId, setServiceId] = useState<string | undefined>();
  const [session, setSession] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const active = state !== "closed";

  const close = useCallback(() => {
    if (bookingRequest()) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    setState((s) => (s === "open" ? "closing" : s));
  }, []);

  useEffect(() => {
    const sync = () => {
      const request = bookingRequest();
      if (!request) {
        setState((s) => (s === "open" ? "closing" : s));
        return;
      }
      if (state === "open") return; // repeated taps must not reset the form
      returnFocus.current = document.activeElement as HTMLElement | null;
      setServiceId(request.serviceId);
      setSession((n) => n + 1); // a fresh flow each time it opens
      setState("open");
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener(OPEN_EVENT, sync);
    sync(); // includes a link tapped before this component mounted
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener(OPEN_EVENT, sync);
    };
  }, [state]);

  // A backgrounded phone or disabled animation may never send animationend.
  useEffect(() => {
    if (state !== "closing") return;
    const fallback = window.setTimeout(() => setState("closed"), 450);
    return () => window.clearTimeout(fallback);
  }, [state]);

  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const background = document.querySelector<HTMLElement>(".vb-entry") ?? document.getElementById("booking");
    const wasInert = background?.hasAttribute("inert");
    const scrollbar = window.innerWidth - html.clientWidth;
    const previousOverflow = html.style.overflow;
    const previousPadding = html.style.paddingRight;
    html.style.overflow = "hidden";
    html.style.paddingRight = `${scrollbar}px`;
    background?.setAttribute("inert", "");
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab" || !panel.current) return;
      const controls = panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || focused === panel.current || !panel.current.contains(focused))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (focused === last || !panel.current.contains(focused))) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!wasInert) background?.removeAttribute("inert");
      html.style.overflow = previousOverflow;
      html.style.paddingRight = previousPadding;
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [active, close]);

  // After the exit animation, unmount and hand focus back.
  const onAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget || state !== "closing") return;
    setState("closed");
  };

  if (state === "closed") return null;

  return createPortal(
    <div
      className="vb-sheet"
      data-state={state}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-page-title"
    >
      <div
        ref={panel}
        className="vb-sheet-panel"
        tabIndex={-1}
        data-scroller=""
        onAnimationEnd={onAnimationEnd}
      >
        <div className="vb-sheet-head">
          <button type="button" className="vb-sheet-back" onClick={close}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 10H4m5-5-5 5 5 5" />
            </svg>
            <span>Back</span>
          </button>
          <span className="vb-brand">
            <Mark />
            <span>{tenant.name}</span>
          </span>
          <span className="vb-sheet-location">{area()}</span>
        </div>
        <div className="vb-sheet-body vb-book">
          <div className="vb-book-head vb-sheet-intro">
            <h1 id="booking-page-title">Make a<br />Booking.</h1>
            <p>Choose a service.<br />Find a time that suits you.</p>
          </div>
          <div className="vb-book-flow">
            <BookingFlow key={session} initialServiceId={serviceId} onDone={close} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
