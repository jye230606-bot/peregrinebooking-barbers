"use client";

import { useEffect, useRef, useState } from "react";
import { tenant, type DateKey } from "@/config/tenant";
import { LIMITS, serviceById } from "@/booking/rules";
import { useTenant } from "./TenantContext";
import { dateLabel, shopDateKey, timeLabel } from "@/booking/time";
import type { GuestBooking } from "@/booking/server/api";
import { api, money } from "./client-api";
import { scrollToEl } from "./Motion";
import { DatePicker, Step, TimeGrid } from "./Pickers";

/**
 * The whole booking, on one page: service → date → time → details →
 * confirmed. Each step rises in once the one before it is answered, and the
 * page glides down to it. Nothing is confirmed here — the server decides, and
 * this shows what it said.
 */

type Created = { booking: GuestBooking; manageUrl: string; icsUrl: string };

export function BookingFlow({ initialServiceId, onDone }: { initialServiceId?: string; onDone?: () => void } = {}) {
  const cfg = useTenant();
  const [now, setNow] = useState<Date | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(
    initialServiceId && serviceById(initialServiceId, cfg) ? initialServiceId : null,
  );
  const [date, setDate] = useState<DateKey | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [free, setFree] = useState<string[] | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [refresh, setRefresh] = useState(0);

  const dateRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const service = serviceId ? serviceById(serviceId, cfg) ?? null : null;

  // The clock is the browser's, set after mount so the server render and the
  // first client render agree. It ticks so a tab left open doesn't offer the past.
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!service || !date) return;
    let live = true;
    setFree(null);
    api<{ starts: string[] }>(`/availability?date=${date}&service=${service.id}`).then((res) => {
      if (!live) return;
      if (res.ok) setFree(res.data.starts);
      else {
        setFree([]);
        setTimeError(res.error);
      }
    });
    return () => {
      live = false;
    };
  }, [service, date, refresh]);

  // A chosen time that has since passed or been taken is cleared.
  useEffect(() => {
    if (startsAt && free && !free.includes(startsAt)) setStartsAt(null);
  }, [free, startsAt]);

  // Wait a frame for the step to mount, then glide to it.
  const reveal = (ref: React.RefObject<HTMLDivElement | null>) =>
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToEl(ref.current, 24)));

  function chooseService(id: string) {
    setServiceId(id);
    setStartsAt(null);
    setTimeError(null);
    if (!date) reveal(dateRef);
  }

  function chooseDate(key: DateKey) {
    setDate(key);
    setStartsAt(null);
    setTimeError(null);
    reveal(timeRef);
  }

  function chooseTime(iso: string) {
    setStartsAt(iso);
    setFormError(null);
    reveal(detailsRef);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !startsAt || sending) return;
    const form = new FormData(e.currentTarget);
    setSending(true);
    setFormError(null);
    const res = await api<Created>("/bookings", {
      method: "POST",
      body: {
        serviceId: service.id,
        startsAt,
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        notes: form.get("notes"),
      },
    });
    setSending(false);
    if (res.ok) {
      setCreated(res.data);
      reveal(doneRef);
      return;
    }
    // The time went while they typed: send them back to the grid with fresh times.
    if (["taken", "blocked", "past", "too-soon", "after-close", "closed", "outside-hours", "too-far"].includes(res.code ?? "")) {
      setStartsAt(null);
      setTimeError(res.error);
      setRefresh((n) => n + 1);
      reveal(timeRef);
      return;
    }
    setFormError(res.error);
  }

  if (created) {
    const b = created.booking;
    const key = shopDateKey(new Date(b.startsAt));
    return (
      <div ref={doneRef} className="vb-stack">
        <section className="vb-accent-block vb-rise vb-stack" aria-live="polite" style={{ gap: "var(--pad)" }}>
          <span className="vb-check" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <p className="vb-label" style={{ margin: 0 }}>
            Booking confirmed
          </p>
          <p className="vb-section-title" style={{ fontSize: "var(--fs-title)" }}>
            {dateLabel(key)}
            <br />
            {timeLabel(b.startsAt)}–{timeLabel(b.endsAt)}
          </p>
        </section>
        <section className="vb-block vb-rise vb-stack" style={{ "--i": 3 } as React.CSSProperties}>
          <dl className="vb-hours">
            <dt>Service</dt>
            <dd>{b.serviceName}</dd>
            <dt>Price</dt>
            <dd>{money(b.priceCents)}</dd>
            <dt>Where</dt>
            <dd>In your confirmation email</dd>
            <dt>Pay</dt>
            <dd>Card or cash, on the day</dd>
          </dl>
          <a className="vb-btn vb-btn-primary vb-btn-center" href={created.icsUrl} style={{ marginTop: "var(--gap)" }}>
            Add to calendar
          </a>
          <a className="vb-btn vb-btn-ghost vb-btn-center" href={created.manageUrl}>
            Change or cancel
          </a>
          <p className="vb-label" style={{ margin: 0, textAlign: "center" }}>
            A confirmation has been sent to your email. Changes and cancellations can be made online up to{" "}
            {cfg.rules.guestChangeCutoffHours} hours before.
          </p>
          {onDone && (
            <button type="button" className="vb-btn vb-btn-ghost vb-btn-center" onClick={onDone}>
              Done
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <>
      <Step n="01" label="Service" id="step-service">
        <div className="vb-stack" role="group" aria-label="Choose a service">
          {cfg.services.map((s) => (
            <button
              key={s.id}
              type="button"
              className="vb-btn vb-service"
              aria-pressed={serviceId === s.id}
              onClick={() => chooseService(s.id)}
            >
              <span className="vb-display">{s.name}</span>
              <span className="vb-service-meta">
                <span className="vb-service-price">{money(s.priceCents)}</span>
                <span className="vb-service-sub">{s.durationMin} min</span>
              </span>
            </button>
          ))}
        </div>
      </Step>

      {service && now && (
        <div ref={dateRef}>
          <Step n="02" label="Date" id="step-date">
            <DatePicker now={now} value={date} onChange={chooseDate} />
          </Step>
        </div>
      )}

      {service && now && date && (
        <div ref={timeRef}>
          <Step n="03" label="Time" sub={dateLabel(date)} id="step-time">
            {timeError && (
              <p className="vb-notice" role="alert" style={{ marginTop: 0 }}>
                {timeError}
              </p>
            )}
            <TimeGrid key={`${date}-${service.id}-${refresh}`} date={date} service={service} now={now} free={free} value={startsAt} onChange={chooseTime} />
          </Step>
        </div>
      )}

      {service && date && startsAt && (
        <div ref={detailsRef}>
          <Step n="04" label="Your details" id="step-details">
            <form className="vb-stack" onSubmit={submit} style={{ gap: "var(--pad)" }}>
              <div className="vb-chip" style={{ justifySelf: "start" }}>
                <span className="vb-dot" aria-hidden="true" />
                {service.name} · {dateLabel(date)} · {timeLabel(startsAt)} · {money(service.priceCents)}
              </div>
              <label className="vb-field">
                <span className="vb-label">Name</span>
                <input className="vb-input" name="name" autoComplete="name" required maxLength={LIMITS.name} placeholder="" />
              </label>
              <label className="vb-field">
                <span className="vb-label">Mobile</span>
                <input className="vb-input" name="phone" type="tel" autoComplete="tel" inputMode="tel" required maxLength={LIMITS.phone} placeholder="0412 345 678" />
              </label>
              <label className="vb-field">
                <span className="vb-label">Email</span>
                <input className="vb-input" name="email" type="email" autoComplete="email" required maxLength={LIMITS.email} placeholder="you@example.com" />
              </label>
              <label className="vb-field">
                <span className="vb-label">Notes (optional)</span>
                <textarea className="vb-input" name="notes" maxLength={LIMITS.notes} placeholder="" />
              </label>
              {formError && (
                <p className="vb-notice" role="alert" style={{ margin: 0 }}>
                  {formError}
                </p>
              )}
              <button type="submit" className="vb-btn vb-btn-primary vb-btn-center" disabled={sending}>
                {sending ? "Booking…" : (
                  <>
                    Book {service.name.toLowerCase()} at {timeLabel(startsAt)}
                    <span className="vb-btn-arrow" aria-hidden="true">→</span>
                  </>
                )}
              </button>
              <p className="vb-label" style={{ margin: 0, textAlign: "center" }}>
                {tenant.payment}
              </p>
            </form>
          </Step>
        </div>
      )}
    </>
  );
}
