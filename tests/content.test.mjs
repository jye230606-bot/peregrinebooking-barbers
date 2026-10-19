import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { tenant } from "../src/config/tenant.ts";
import { reviews } from "../src/content/reviews.ts";

/**
 * What came over from Booksy must arrive intact, in both places it lives, and
 * the page must keep to its three colours and its hard edges.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFile(path.join(root, p), "utf8");
const sqlText = (s) => `'${s.replaceAll("'", "''")}'`;

test("all 16 Booksy reviews, 5.0 average, newest first, the four rating-only rows empty", () => {
  assert.equal(reviews.length, 16);
  assert.ok(reviews.every((r) => r.rating === 5 && r.source === "booksy"));
  const dates = reviews.map((r) => r.reviewedOn);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.deepEqual(
    reviews.filter((r) => r.body === null).map((r) => r.author),
    ["Jason", "James", "Ethan"],
  );
  assert.equal(reviews.filter((r) => r.service === "Haircut + beard").length, 1);
  // Spelling, case and emoji exactly as written.
  assert.ok(reviews.some((r) => r.body?.includes("skils and cognitive ability")));
  assert.ok(reviews.some((r) => r.author === "kai" && r.body === "cleaned up my clapped head,"));
  assert.ok(reviews.some((r) => r.body === "Superb haircut and fixed up my beard real nice 🔥🔥🔥"));
  assert.ok(reviews.some((r) => r.body === "Best barber i’ve been too"));
});

test("seed.sql carries every review exactly as reviews.ts does", async () => {
  const seed = await read("supabase/seed.sql");
  for (const r of reviews) {
    const line = seed.split("\n").find((l) => l.includes(r.id));
    assert.ok(line, `review ${r.id} missing from seed`);
    assert.ok(line.includes(sqlText(r.author)), r.author);
    assert.ok(line.includes(r.body === null ? "null" : sqlText(r.body)), r.author);
    assert.ok(line.includes(sqlText(r.service)) && line.includes(`'${r.reviewedOn}'`), r.author);
  }
});

test("seed.sql carries the services, hours and overrides in tenant.ts", async () => {
  const seed = await read("supabase/seed.sql");
  for (const s of tenant.services) {
    assert.ok(seed.includes(`('${s.id}', '${s.name}', ${s.durationMin}, ${s.priceCents},`), s.name);
  }
  tenant.weeklyHours.forEach((h, day) => {
    if (h) assert.match(seed, new RegExp(`, ${day}, '${h[0]}', '${h[1]}'\\)`), `weekday ${day}`);
    else assert.doesNotMatch(seed, new RegExp(`', ${day}, '\\d\\d:\\d\\d'`), `weekday ${day} should be closed`);
  });
  for (const o of tenant.overrides) assert.ok(seed.includes(`'${o.date}'`), o.date);
});

test("the migration is additive, stays in the vbarbers schema, and keeps every table tenant-scoped and RLS-locked", async () => {
  const dir = path.join(root, "supabase/migrations");
  const [file] = await readdir(dir);
  const sql = await readFile(path.join(dir, file), "utf8");
  assert.doesNotMatch(sql, /\b(drop|alter\s+table\s+\S+\s+(drop|rename|alter)|rename|truncate)\b/i);
  assert.doesNotMatch(sql, /\bpublic\./, "nothing in public: it already holds other clients' tables");
  const tables = [...sql.matchAll(/create table vbarbers\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["blocks", "bookings", "customers", "date_overrides", "reviews", "services", "tenants", "weekly_hours"]);
  for (const t of tables) {
    assert.match(sql, new RegExp(`alter table vbarbers\\.${t}\\s+enable row level security`), `${t} RLS`);
    if (t !== "tenants") assert.match(sql, new RegExp(`create table vbarbers\\.${t} \\([^;]*tenant_id\\s+uuid not null`, "s"), `${t} tenant_id`);
  }
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /exclude using gist \(\s*tenant_id with =,\s*tstzrange\(starts_at, blocked_until\) with &&\s*\) where \(status = 'confirmed'\)/);
});

test("every colour and motion curve comes from the tokens, and reduced motion is honoured", async () => {
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = strip(await read("src/styles/tokens.css"));
  const globals = strip(await read("src/app/globals.css"));
  // Colours are defined once, as tokens, and used by name everywhere else.
  assert.doesNotMatch(globals, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  const palette = new Set([...tokens.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()));
  assert.ok(palette.has("#08c8f0"), "Vance's electric blue is the accent");
  // Curves live in the tokens; the stylesheet only names them.
  assert.doesNotMatch(globals, /cubic-bezier\(/);
  assert.match(tokens, /--ease-out: cubic-bezier\(/);
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  // Text on the accent is the dark token, never white.
  assert.match(tokens, /--c-on-accent: var\(--vb-black\)/);
});

test("no secret is exposed to the browser", async () => {
  const files = await readdir(path.join(root, "src"), { recursive: true });
  for (const f of files.filter((f) => /\.(ts|tsx)$/.test(f))) {
    const src = await read(path.join("src", f));
    assert.doesNotMatch(src, /NEXT_PUBLIC_/, f);
    if (/"use client"/.test(src)) assert.doesNotMatch(src, /SUPABASE|SERVICE_ROLE|process\.env/, f);
  }
});
