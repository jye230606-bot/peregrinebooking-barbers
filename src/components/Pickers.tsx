"use client";

import type { DateKey, Service } from "@/config/tenant";
import { bookingWindow, gridStarts, openingOn } from "@/booking/rules";
import { useTenant } from "./TenantContext";
import { dateLabel, shiftDays, shopMinutes, timeLabel, weekdayName, weekdayOf, weekdayShort } from "@/booking/time";

/**
 * The date grid and the time grid, shared by the booking flow and the
 * manage page. Both use the rules module the server enforces, so a day or a
 * time offered here is one the server will accept unless the diary changed.
 */

// Times are split by the shop's clock: before noon, before 5pm, after.
const PARTS = [
  { name: "Morning", until: 12 * 60 },
  { name: "Afternoon", until: 17 * 60 },
  { name: "Evening", until: 24 * 60 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function DatePicker({
  now,
  value,
  onChange,
}: {
  now: Date;
  value: DateKey | null;
  onChange: (key: DateKey) => void;
}) {
  const cfg = useTenant();
  const days = bookingWindow(now, cfg);
  const first = days[0];
  const last = days[days.length - 1];
  // Pad the grid out to whole Monday-to-Sunday weeks.
  const start = shiftDays(first, -((weekdayOf(first) + 6) % 7));
  const cells: DateKey[] = [];
  for (let k = start; k <= last || weekdayOf(k) !== 1; k = shiftDays(k, 1)) cells.push(k);

  return (
    <div>
      <div className="vb-cal" aria-hidden="true">
        {WEEK.map((d) => (
          <span key={d} className="vb-label vb-cal-head">
            {weekdayShort(d).slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="vb-cal" role="group" aria-label="Choose a date">
        {cells.map((key, i) => {
          if (key < first || key > last) return <span key={key} className="vb-cal-spacer" />;
          const [, m, d] = key.split("-").map(Number);
          const open = openingOn(key, cfg) !== null;
          const showMonth = d === 1 || i === 0 || key === first;
          return (
            <button
              key={key}
              type="button"
              className="vb-btn"
              disabled={!open}
              aria-pressed={value === key}
              aria-label={`${weekdayName(weekdayOf(key))} ${d} ${MONTHS[m - 1]}${open ? "" : ", closed"}`}
              onClick={() => onChange(key)}
            >
              <span className="vb-label vb-cal-month">
                {key === first ? "Today" : showMonth ? MONTHS[m - 1] : ""}
              </span>
              <span className="vb-cal-day">{d}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimeGrid({
  date,
  service,
  now,
  free,
  value,
  onChange,
}: {
  date: DateKey;
  service: Service;
  now: Date;
  /** Free starts from the server, or null while loading. */
  free: string[] | null;
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const cfg = useTenant();
  if (free === null) return <p className="vb-label">Finding free times…</p>;

  const hours = openingOn(date, cfg);
  const all = gridStarts(date, service, cfg).filter((t) => t > now);
  const freeSet = new Set(free);

  if (!hours || freeSet.size === 0) {
    return (
      <p className="vb-notice" role="status" style={{ margin: 0 }}>
        No times available on {dateLabel(date)}.
      </p>
    );
  }

  const groups = PARTS.map((part, p) => ({
    name: part.name,
    times: all.filter((t) => {
      const m = shopMinutes(t);
      return m < part.until && (p === 0 || m >= PARTS[p - 1].until);
    }),
  })).filter((g) => g.times.length > 0);

  let i = 0; // one stagger across all groups
  return (
    <div className="vb-time-groups">
      {groups.map((g) => (
        <div key={g.name} className="vb-time-group">
          <h3 className="vb-label vb-time-group-h">{g.name}</h3>
          <div className="vb-times" role="group" aria-label={`${g.name} times on ${dateLabel(date)}`}>
            {g.times.map((t) => {
              const iso = t.toISOString();
              const available = freeSet.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  className="vb-btn vb-rise"
                  style={{ "--i": i++ } as React.CSSProperties}
                  disabled={!available}
                  aria-pressed={value === iso}
                  aria-label={`${timeLabel(t)}${available ? "" : ", unavailable"}`}
                  onClick={() => onChange(iso)}
                >
                  {timeLabel(t)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Step({
  n,
  label,
  sub,
  children,
  id,
}: {
  n: string;
  label: string;
  sub?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="vb-block vb-rise" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="vb-step">
        <span className="vb-step-n">{n}</span>
        <h2 className="vb-step-title" id={id ? `${id}-h` : undefined}>
          {label}
          {sub && <span className="vb-muted"> {sub}</span>}
        </h2>
      </div>
      {children}
    </section>
  );
}
