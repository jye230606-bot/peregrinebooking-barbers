import { tenant } from "@/config/tenant";
import { weekdayName, weekdayShort } from "@/booking/time";

/** The open days as a run, Monday-first: "Tuesday to Saturday" / "Tue–Sat". Derived, never typed. */
export function openDays(style: "long" | "short" = "long"): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const open = order.filter((d) => tenant.weeklyHours[d]);
  if (open.length === 0) return "";
  const name = style === "long" ? weekdayName : weekdayShort;
  const contiguous = open.every((d, i) => i === 0 || order.indexOf(d) === order.indexOf(open[i - 1]) + 1);
  if (!contiguous) return open.map(name).join(", ");
  if (open.length === 1) return name(open[0]);
  return style === "long" ? `${name(open[0])} to ${name(open[open.length - 1])}` : `${name(open[0])}–${name(open[open.length - 1])}`;
}
