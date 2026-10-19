import type { NextRequest } from "next/server";
import { handle, type ApiRequest } from "@/booking/server/api";
import { config } from "@/booking/server/config";

/**
 * The booking API. One catch-all, adapting a Next request into the plain shape
 * `src/booking/server/api.ts` is written against, so every rule has exactly one
 * implementation and none of it depends on the framework.
 */

// node:crypto and the file store; and the diary is never a static answer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(request: NextRequest, ctx: { params: Promise<{ route: string[] }> }) {
  const { route } = await ctx.params;

  let body: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (raw.length > 16_000) return Response.json({ error: "Too large." }, { status: 413 });
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return Response.json({ error: "Body must be JSON." }, { status: 400 });
      }
    }
  }

  const forwarded = request.headers.get("x-forwarded-for");
  // The host the guest actually used (nextUrl normalises 127.0.0.1 to localhost in dev).
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0] ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const apiRequest: ApiRequest = {
    method: request.method,
    path: `/${(route ?? []).join("/")}`,
    query: Object.fromEntries(request.nextUrl.searchParams),
    body,
    ip: forwarded?.split(",")[0]?.trim() || "local",
    cookie: request.headers.get("cookie") ?? undefined,
    contentType: request.headers.get("content-type") ?? undefined,
    origin: `${proto}://${host}`,
    secure: proto === "https",
  };

  let out;
  try {
    out = await handle(apiRequest, config());
  } catch (e) {
    console.error("[booking api]", e instanceof Error ? e.message : e);
    return Response.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
  }

  const headers = new Headers(out.headers);
  if (out.raw !== undefined) return new Response(out.raw, { status: out.status, headers });
  if (out.body === undefined) return new Response(null, { status: out.status, headers });
  headers.set("Content-Type", "application/json");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(out.body), { status: out.status, headers });
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
