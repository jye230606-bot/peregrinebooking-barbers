"use client";

import { useEffect, useState } from "react";
import type { TenantConfig } from "@/config/tenant";
import { useTenant } from "./TenantContext";
import { openingOn } from "@/booking/rules";
import { minutesOf, shiftDays, shopMinutes, todayKey, weekdayName, weekdayOf } from "@/booking/time";

/**
 * Business hours as Booksy lists them — the whole week, then the special
 * dates — with today marked and a live open/closed line, in Melbourne time.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const order = [0, 1, 2, 3, 4, 5, 6]; // Booksy starts the week on Sunday

function status(now: Date, cfg: TenantConfig) {
  const today = todayKey(now);
  const hours = openingOn(today, cfg);
  const mins = shopMinutes(now);
  if (hours && mins >= minutesOf(hours.open) && mins < minutesOf(hours.close)) {
    return { open: true, text: `Open now · until ${hours.close}` };
  }
  for (let i = hours && mins < minutesOf(hours.open) ? 0 : 1; i <= 14; i++) {
    const key = shiftDays(today, i);
    const h = openingOn(key, cfg);
    if (!h) continue;
    const day = i === 0 ? "today" : i === 1 ? "tomorrow" : weekdayName(weekdayOf(key));
    return { open: false, text: `Closed · opens ${day} at ${h.open}` };
  }
  return { open: false, text: "Closed" };
}

export function Hours() {
  const cfg = useTenant();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayIndex = now ? weekdayOf(todayKey(now)) : -1;
  const s = now ? status(now, cfg) : null;
  const today = now ? todayKey(now) : "";
  const special = cfg.overrides.filter((o) => !today || o.date >= today);

  return (
    <div className="vb-stack" style={{ gap: "var(--pad)" }}>
      <p className="vb-hours-status" aria-live="polite">
        <span className="vb-dot" data-closed={s && !s.open ? "" : undefined} aria-hidden="true" />
        {s ? s.text : " "}
      </p>
      <dl className="vb-hours vb-hours-week">
        {order.map((d) => {
          const h = cfg.weeklyHours[d];
          return (
            <div key={d} className="vb-hours-row" data-today={d === todayIndex ? "" : undefined}>
              <dt>{weekdayName(d)}</dt>
              <dd>{h ? `${h[0]} – ${h[1]}` : "Closed"}</dd>
            </div>
          );
        })}
      </dl>
      {special.length > 0 && (
        <>
          <p className="vb-label" style={{ margin: 0 }}>
            Special dates
          </p>
          <dl className="vb-hours vb-hours-week">
            {special.map((o) => {
              const [y, m, d] = o.date.split("-").map(Number);
              return (
                <div key={o.date} className="vb-hours-row">
                  <dt>
                    {d} {MONTHS[m - 1]} {y}
                  </dt>
                  <dd>{o.closed ? "Closed" : `${o.open} – ${o.close}`}</dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </div>
  );
}
