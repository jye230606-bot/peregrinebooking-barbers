"use client";

import { useEffect, useState } from "react";
import { tenant, type DateKey } from "@/config/tenant";
import { serviceById } from "@/booking/rules";
import { useTenant } from "./TenantContext";
import { dateLabel, shopDateKey, timeLabel } from "@/booking/time";
import type { GuestBooking } from "@/booking/server/api";
import { api, money } from "./client-api";
import { DatePicker, Step, TimeGrid } from "./Pickers";

/**
 * Cancel or move a booking, up to the cutoff. After it, the page says to
 * contact Vance instead — and the server refuses either way.
 */

type Mode = "view" | "cancel" | "move";

export function ManageBooking({ initial, token, address }: { initial: GuestBooking; token: string; address: string }) {
  const cfg = useTenant();
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [date, setDate] = useState<DateKey | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [free, setFree] = useState<string[] | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const service = serviceById(booking.serviceId, cfg);
  const key = shopDateKey(new Date(booking.startsAt));
  const ics = `/api/booking/bookings/${booking.id}/ics?t=${encodeURIComponent(token)}`;
  const contact = `https://www.instagram.com/${tenant.instagram}/`;

  useEffect(() => setNow(new Date()), []);

  useEffect(() => {
    if (mode !== "move" || !date || !service) return;
    let live = true;
    setFree(null);
    setAvailabilityError(null);
    api<{ starts: string[] }>(`/availability?date=${date}&service=${service.id}`).then((res) => {
      if (!live) return;
      setFree(res.ok ? res.data.starts : []);
      if (!res.ok) setAvailabilityError(res.error);
    });
    return () => {
      live = false;
    };
  }, [mode, date, service, refresh]);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await api<GuestBooking>(`/bookings/${booking.id}/cancel`, { method: "POST", body: { t: token } });
    setBusy(false);
    if (res.ok) {
      setBooking(res.data);
      setMode("view");
      setNotice("Cancelled. A note is on its way to your email.");
    } else setError(res.error);
  }

  async function move() {
    if (!startsAt) return;
    setBusy(true);
    setError(null);
    const res = await api<GuestBooking>(`/bookings/${booking.id}/reschedule`, {
      method: "POST",
      body: { t: token, startsAt },
    });
    setBusy(false);
    if (res.ok) {
      setBooking(res.data);
      setMode("view");
      setDate(null);
      setStartsAt(null);
      setNotice("Moved. A new confirmation is on its way to your email.");
    } else {
      // Most likely the time went meanwhile: show fresh times.
      setError(res.error);
      setStartsAt(null);
      setRefresh((n) => n + 1);
    }
  }

  const cancelled = booking.status === "cancelled";

  return (
    <>
      <section className={cancelled ? "vb-block" : "vb-accent-block"} aria-live="polite">
        <p className="vb-label" style={{ margin: "0 0 var(--gap)" }}>
          {cancelled ? "Cancelled" : "Confirmed"} · {booking.serviceName}
        </p>
        <p
          className="vb-display vb-title"
          style={{ margin: 0, textDecoration: cancelled ? "line-through" : undefined }}
        >
          {dateLabel(key)}
          <br />
          {timeLabel(booking.startsAt)}
        </p>
      </section>

      <section className="vb-block vb-stack">
        <dl className="vb-hours">
          <dt className="vb-label">Name</dt>
          <dd>{booking.name}</dd>
          <dt className="vb-label">Time</dt>
          <dd>
            {timeLabel(booking.startsAt)}–{timeLabel(booking.endsAt)}
          </dd>
          <dt className="vb-label">Price</dt>
          <dd>{money(booking.priceCents)}</dd>
          <dt className="vb-label">Where</dt>
          <dd>{address}</dd>
        </dl>
        {!cancelled && <p style={{ margin: 0 }}>{tenant.payment}</p>}
        {notice && (
          <p className="vb-notice" role="status" style={{ margin: 0 }}>
            {notice}
          </p>
        )}
        {error && (
          <p className="vb-notice" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        {!cancelled && (
          <a className="vb-btn vb-btn-center vb-label" href={ics}>
            Add to calendar
          </a>
        )}
      </section>

      {!cancelled && !booking.canChange && (
        <section className="vb-block vb-stack">
          <p style={{ margin: 0 }}>
            This booking is less than {cfg.rules.guestChangeCutoffHours} hours away, so it can’t be changed online.
            Contact @{tenant.instagram} on Instagram.
          </p>
          <a className="vb-btn vb-btn-center vb-label" href={contact} target="_blank" rel="noopener noreferrer">
            @{tenant.instagram} on Instagram
          </a>
        </section>
      )}

      {!cancelled && booking.canChange && mode === "view" && (
        <section className="vb-block vb-stack">
          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setMode("move")}>
            Move to another time
          </button>
          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setMode("cancel")}>
            Cancel booking
          </button>
          <p className="vb-label" style={{ margin: 0 }}>
            Changes online up to {cfg.rules.guestChangeCutoffHours} hours before.
          </p>
        </section>
      )}

      {mode === "cancel" && (
        <section className="vb-block vb-stack">
          <p style={{ margin: 0 }}>Cancel your {booking.serviceName.toLowerCase()} on {dateLabel(key)} at {timeLabel(booking.startsAt)}?</p>
          <button type="button" className="vb-btn vb-btn-primary vb-btn-center vb-label" disabled={busy} onClick={cancel}>
            {busy ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setMode("view")}>
            Keep it
          </button>
        </section>
      )}

      {mode === "move" && service && now && (
        <>
          <Step n="01" label="New date" id="move-date">
            <DatePicker
              now={now}
              value={date}
              onChange={(k) => {
                setDate(k);
                setStartsAt(null);
              }}
            />
          </Step>
          {date && (
            <Step n="02" label={`New time · ${dateLabel(date)}`} id="move-time">
              {availabilityError ? (
                <div className="vb-stack">
                  <p className="vb-notice" role="alert" style={{ margin: 0 }}>{availabilityError}</p>
                  <button type="button" className="vb-btn vb-btn-center" onClick={() => setRefresh((n) => n + 1)}>Retry times</button>
                </div>
              ) : (
                <TimeGrid date={date} service={service} now={now} free={free} value={startsAt} onChange={setStartsAt} />
              )}
            </Step>
          )}
          <section className="vb-block vb-stack">
            <button
              type="button"
              className="vb-btn vb-btn-primary vb-btn-center vb-label"
              disabled={!startsAt || busy}
              onClick={move}
            >
              {busy ? "Moving…" : startsAt ? `Move to ${dateLabel(date!)} · ${timeLabel(startsAt)}` : "Pick a new time"}
            </button>
            <button
              type="button"
              className="vb-btn vb-btn-center vb-label"
              onClick={() => {
                setMode("view");
                setDate(null);
                setStartsAt(null);
              }}
            >
              Keep current time
            </button>
          </section>
        </>
      )}

      {cancelled && (
        <section className="vb-block">
          <a className="vb-btn vb-btn-center vb-label" href="/">
            Make a new booking
          </a>
        </section>
      )}
    </>
  );
}
