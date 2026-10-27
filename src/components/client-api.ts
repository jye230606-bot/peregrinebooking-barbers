/**
 * The browser's one door to the booking API. It never sees Supabase, keys or
 * other people's bookings — only what `src/booking/server/api.ts` hands out.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`/api/booking${path}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const data = await res.json();
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, status: res.status, error: data.error ?? "Something went wrong. Please try again.", code: data.code };
  } catch {
    if (controller.signal.aborted) {
      return { ok: false, status: 0, error: init.method && init.method !== "GET"
        ? "The booking system took too long to respond. Check your confirmation email before you try again."
        : "The booking system took too long to respond. Please try again." };
    }
    // Includes a proxy returning HTML instead of a valid API response.
    return { ok: false, status: 0, error: "Couldn’t reach the booking system. Check your connection and try again." };
  } finally {
    clearTimeout(timeout);
  }
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
