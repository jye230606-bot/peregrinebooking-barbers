"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookingFlow } from "./BookingFlow";
import { Mark } from "./Mark";
import { area, tenant } from "@/config/tenant";

/**
 * Local motion prototype: booking rises as a full page over the landing page,
 * with the original rounded controls, palette and typography.
 *
 * Opened from anywhere with `openBooking(serviceId?)`. Back and Escape reverse
 * the transition. A native dialog keeps focus inside until the exit finishes.
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
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const active = state !== "closed";

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
    if (!active) return;
    const html = document.documentElement;
    const modal = dialog.current;
    const scrollbar = window.innerWidth - html.clientWidth;
    const previousOverflow = html.style.overflow;
    const previousPadding = html.style.paddingRight;
    html.style.overflow = "hidden";
    html.style.paddingRight = `${scrollbar}px`;
    modal?.showModal();
    panel.current?.focus({ preventScroll: true });
    return () => {
      modal?.close();
      html.style.overflow = previousOverflow;
      html.style.paddingRight = previousPadding;
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [active]);

  // After the exit animation, unmount and hand focus back.
  const onAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget || state !== "closing") return;
    setState("closed");
  };

  if (state === "closed") return null;

  return (
    <dialog
      ref={dialog}
      className="vb-sheet"
      data-state={state}
      aria-labelledby="booking-page-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
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
    </dialog>
  );
}
