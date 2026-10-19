/**
 * The browser's one door to the booking API. It never sees Supabase, keys or
 * other people's bookings — only what `src/booking/server/api.ts` hands out.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/booking${path}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, status: res.status, error: data.error ?? "Something went wrong. Please try again.", code: data.code };
  } catch {
    return { ok: false, status: 0, error: "Couldn’t reach the booking system. Check your connection and try again." };
  }
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
