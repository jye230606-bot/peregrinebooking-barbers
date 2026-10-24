"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tenant, type DateKey } from "@/config/tenant";
import { gridStarts, openingOn, serviceById } from "@/booking/rules";
import { useTenant } from "./TenantContext";
import { dateLabel, shiftDays, shopDateKey, timeLabel, weekdayOf } from "@/booking/time";
import type { Block, Booking } from "@/booking/types";
import { api, money } from "./client-api";

/**
 * The owner's console. Plain on purpose: the same tokens as the guest page,
 * and every action goes through the API, which checks the session again.
 */

export function OwnerSignIn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = new FormData(e.currentTarget).get("password");
    const res = await api("/owner/session", { method: "POST", body: { password } });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <form className="vb-block vb-stack" onSubmit={submit}>
      <label className="vb-field">
        <span className="vb-label">Password</span>
        <input className="vb-input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p className="vb-notice" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <button className="vb-btn vb-btn-primary vb-btn-center vb-label" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

type OwnerBooking = Omit<Booking, "manageTokenHash">;
type Diary = { bookings: OwnerBooking[]; blocks: Block[] };
type View = "day" | "week";

const monday = (key: DateKey) => shiftDays(key, -((weekdayOf(key) + 6) % 7));

export function OwnerConsole({ today, feedPath }: { today: DateKey; feedPath: string | null }) {
  const cfg = useTenant();
  const router = useRouter();
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<DateKey>(today);
  const [diary, setDiary] = useState<Diary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const from = view === "day" ? day : monday(day);
  const to = view === "day" ? day : shiftDays(monday(day), 6);

  const load = useCallback(async () => {
    const res = await api<Diary>(`/owner/diary?from=${from}&to=${to}`);
    if (res.ok) setDiary(res.data);
    else if (res.status === 401) router.refresh();
    else setError(res.error);
  }, [from, to, router]);

  useEffect(() => {
    setDiary(null);
    load();
  }, [load]);

  async function act(path: string, method: string, body: unknown, done: string) {
    setError(null);
    setNotice(null);
    const res = await api(path, { method, body });
    if (res.ok) {
      setNotice(done);
      setConfirming(null);
      await load();
      return true;
    }
    if (res.status === 401) router.refresh();
    setError(res.error);
    return false;
  }

  async function signOut() {
    await api("/owner/session", { method: "DELETE", body: {} });
    router.refresh();
  }

  const days: DateKey[] = [];
  for (let k = from; k <= to; k = shiftDays(k, 1)) days.push(k);

  return (
    <>
      <section className="vb-block vb-stack">
        <div className="vb-tabs" role="group" aria-label="View">
          <button type="button" className="vb-btn vb-btn-center vb-label" aria-pressed={view === "day"} onClick={() => setView("day")}>
            Day
          </button>
          <button type="button" className="vb-btn vb-btn-center vb-label" aria-pressed={view === "week"} onClick={() => setView("week")}>
            Week
          </button>
        </div>
        <div className="vb-tabs" style={{ gridTemplateColumns: "1fr 2fr 1fr" }}>
          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setDay(shiftDays(day, view === "day" ? -1 : -7))}>
            ← Prev
          </button>
          <input
            className="vb-input"
            type="date"
            value={day}
            aria-label="Date"
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setDay(shiftDays(day, view === "day" ? 1 : 7))}>
            Next →
          </button>
        </div>
        {day !== today && (
          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setDay(today)}>
            Today
          </button>
        )}
      </section>

      {notice && (
        <p className="vb-accent-block" role="status" style={{ margin: 0 }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="vb-notice" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      {!diary ? (
        <p className="vb-label">Loading…</p>
      ) : (
        days.map((key) => {
          const bookings = diary.bookings.filter((b) => shopDateKey(new Date(b.startsAt)) === key);
          const blocks = diary.blocks.filter((b) => shopDateKey(new Date(b.startsAt)) === key);
          const hours = openingOn(key, cfg);
          const live = bookings.filter((b) => b.status === "confirmed");
          return (
            <section key={key} className="vb-block vb-stack">
              <div className="vb-row">
                <h2 className="vb-display vb-title" style={{ margin: 0 }}>
                  {dateLabel(key)}
                </h2>
                <span className="vb-label">
                  {hours ? `${hours.open}–${hours.close}` : "Closed"} · {live.length} booked
                </span>
              </div>
              {bookings.length === 0 && blocks.length === 0 && <p className="vb-label" style={{ margin: 0 }}>Nothing booked.</p>}
              {bookings.map((b) => {
                const service = serviceById(b.serviceId, cfg);
                const cancelled = b.status !== "confirmed";
                return (
                  <article key={b.id} className="vb-block vb-stack" style={{ textDecoration: cancelled ? "line-through" : undefined }}>
                    <div className="vb-row">
                      <span className="vb-display" style={{ fontSize: "var(--fs-time)" }}>
                        {timeLabel(b.startsAt)}–{timeLabel(b.endsAt)}
                      </span>
                      <span className="vb-label">
                        {b.status}
                        {b.source === "owner" ? " · by you" : ""}
                      </span>
                    </div>
                    <p style={{ margin: 0 }}>
                      <strong>{b.customer.name}</strong> · {service?.name} · {money(b.priceCentsSnapshot)}
                    </p>
                    <p style={{ margin: 0 }}>
                      <a href={`tel:${b.customer.phone}`}>{b.customer.phone}</a>
                      {b.customer.email && (
                        <>
                          {" · "}
                          <a href={`mailto:${b.customer.email}`}>{b.customer.email}</a>
                        </>
                      )}
                    </p>
                    {b.notes && <p style={{ margin: 0 }}>Notes: {b.notes}</p>}
                    {!cancelled &&
                      (confirming === b.id ? (
                        <div className="vb-tabs">
                          <button
                            type="button"
                            className="vb-btn vb-btn-primary vb-btn-center vb-label"
                            onClick={() => act(`/owner/bookings/${b.id}/cancel`, "POST", {}, `Cancelled ${b.customer.name}'s booking.`)}
                          >
                            Yes, cancel
                          </button>
                          <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setConfirming(null)}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="vb-btn vb-btn-center vb-label" onClick={() => setConfirming(b.id)}>
                          Cancel booking
                        </button>
                      ))}
                  </article>
                );
              })}
              {blocks.map((bl) => (
                <article key={bl.id} className="vb-block vb-row">
                  <span>
                    <span className="vb-label">Blocked </span>
                    {timeLabel(bl.startsAt)}–{timeLabel(bl.endsAt)}
                    {bl.reason ? ` · ${bl.reason}` : ""}
                  </span>
                  <button
                    type="button"
                    className="vb-btn vb-btn-center vb-label"
                    style={{ width: "auto" }}
                    onClick={() => act(`/owner/blocks/${bl.id}`, "DELETE", {}, "Block removed.")}
                  >
                    Remove
                  </button>
                </article>
              ))}
            </section>
          );
        })
      )}

      <BlockForm day={day} onSubmit={(body) => act("/owner/blocks", "POST", body, "Time blocked.")} />
      <ManualBooking day={day} onSubmit={(body) => act("/owner/bookings", "POST", body, "Booking added.")} />

      <section className="vb-block vb-stack">
        {feedPath && (
          <p style={{ margin: 0, overflowWrap: "anywhere" }}>
            <span className="vb-label">Calendar feed </span>
            <a href={feedPath}>{feedPath}</a> — subscribe from Apple or Google Calendar with the full address. Keep it private.
          </p>
        )}
        <button type="button" className="vb-btn vb-btn-center vb-label" onClick={signOut}>
          Sign out
        </button>
      </section>
    </>
  );
}

function BlockForm({ day, onSubmit }: { day: DateKey; onSubmit: (body: unknown) => Promise<boolean> }) {
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await onSubmit({ date: f.get("date"), from: f.get("from"), to: f.get("to"), reason: f.get("reason") });
    if (ok) form.reset();
  }
  return (
    <form className="vb-block vb-stack" onSubmit={submit} key={day}>
      <h2 className="vb-label" style={{ margin: 0 }}>
        Block time
      </h2>
      <label className="vb-field">
        <span className="vb-label">Date</span>
        <input className="vb-input" type="date" name="date" defaultValue={day} required />
      </label>
      <div className="vb-tabs">
        <label className="vb-field">
          <span className="vb-label">From</span>
          <input className="vb-input" type="time" name="from" step={900} required />
        </label>
        <label className="vb-field">
          <span className="vb-label">To</span>
          <input className="vb-input" type="time" name="to" step={900} required />
        </label>
      </div>
      <label className="vb-field">
        <span className="vb-label">Reason (optional)</span>
        <input className="vb-input" name="reason" maxLength={120} />
      </label>
      <button className="vb-btn vb-btn-primary vb-btn-center vb-label">Block it</button>
    </form>
  );
}

function ManualBooking({ day, onSubmit }: { day: DateKey; onSubmit: (body: unknown) => Promise<boolean> }) {
  const cfg = useTenant();
  const [serviceId, setServiceId] = useState(cfg.services[0].id);
  const [date, setDate] = useState(day);
  useEffect(() => setDate(day), [day]);
  const service = serviceById(serviceId, cfg)!;
  const starts = gridStarts(date, service, cfg);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await onSubmit({
      serviceId,
      startsAt: f.get("startsAt"),
      name: f.get("name"),
      phone: f.get("phone"),
      email: f.get("email"),
      notes: f.get("notes"),
    });
    if (ok) form.reset();
  }

  return (
    <form className="vb-block vb-stack" onSubmit={submit}>
      <h2 className="vb-label" style={{ margin: 0 }}>
        Add a booking
      </h2>
      <label className="vb-field">
        <span className="vb-label">Service</span>
        <select className="vb-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {cfg.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {money(s.priceCents)} · {s.durationMin} min
            </option>
          ))}
        </select>
      </label>
      <div className="vb-tabs">
        <label className="vb-field">
          <span className="vb-label">Date</span>
          <input className="vb-input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
        </label>
        <label className="vb-field">
          <span className="vb-label">Time</span>
          <select className="vb-input" name="startsAt" required disabled={starts.length === 0}>
            {starts.length === 0 && <option value="">Closed</option>}
            {starts.map((t) => (
              <option key={t.toISOString()} value={t.toISOString()}>
                {timeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="vb-field">
        <span className="vb-label">Name</span>
        <input className="vb-input" name="name" required maxLength={80} />
      </label>
      <label className="vb-field">
        <span className="vb-label">Mobile</span>
        <input className="vb-input" name="phone" type="tel" required maxLength={32} />
      </label>
      <label className="vb-field">
        <span className="vb-label">Email (optional — sends them a confirmation)</span>
        <input className="vb-input" name="email" type="email" maxLength={120} />
      </label>
      <label className="vb-field">
        <span className="vb-label">Notes (optional)</span>
        <input className="vb-input" name="notes" maxLength={400} />
      </label>
      <button className="vb-btn vb-btn-primary vb-btn-center vb-label" disabled={starts.length === 0}>
        Add booking
      </button>
    </form>
  );
}
