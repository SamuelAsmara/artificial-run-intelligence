/**
 * Permission model check, run against the live project with the demo accounts.
 *
 *   npm run check:permissions        (after `npm run seed:demo`)
 *
 * ## What this verifies
 *
 * Every authorization decision in Runi is made by the database — row-level
 * security, the `profiles_guard_identity` trigger and the SECURITY DEFINER
 * `join_coach` function — not by the interface. So the only honest test is
 * to hold an ordinary session token and try what the interface never offers:
 * read another athlete's runs, read a rival coach's templates, link yourself
 * to a coach without a code, promote yourself to coach, write to somebody
 * else's profile. Each check states what a direct PostgREST call gets back.
 *
 * Three principals are signed in with the anon key and the shared demo
 * password — athlete A (runner1 of coach1), athlete B (runner1 of coach2) and
 * coach1 — plus one client with no session at all. The service-role client
 * is used for two things only: resolving the demo accounts' ids, and putting
 * back any row a failed check may have let through. The database is left as
 * it was found.
 *
 * Exit codes: 0 all checks pass · 1 at least one check fails · 2 cannot run
 * (missing environment or demo accounts). Nothing secret is ever printed.
 *
 * Required in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { Database, Role } from "../src/types/database.types";

const DEMO_DOMAIN = "demo.runi-coach.app";
const EMAILS = {
  a: `runner1-coach1@${DEMO_DOMAIN}`,
  b: `runner1-coach2@${DEMO_DOMAIN}`,
  coach1: `coach1@${DEMO_DOMAIN}`,
  coach2: `coach2@${DEMO_DOMAIN}`,
};
const SEED_HINT = "run `npm run seed:demo` first";

type Client = SupabaseClient<Database>;
type Principal = { id: string; role: Role; full_name: string | null; coach_code: string | null };

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

/** Reads .env.local without adding a dependency; a real environment variable wins. */
function loadEnv(): void {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function cannotRun(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(2);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) cannotRun(`Missing ${name}. Put it in .env.local or export it (${SEED_HINT}).`);
  return v;
}

/* ------------------------------------------------------------------ */
/* Check runner                                                        */
/* ------------------------------------------------------------------ */

const results: { name: string; ok: boolean; detail: string }[] = [];

/** A check returns a one-line reason on success and throws on failure. */
async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

type Res = { data: unknown[] | null; error: { code?: string; message: string } | null };

/** Passes only when the query succeeded and RLS returned no rows at all. */
function expectNoRows(label: string, res: Res): string {
  if (res.error) throw new Error(`${label}: unexpected error ${res.error.code ?? ""} ${res.error.message}`);
  const n = res.data?.length ?? 0;
  if (n > 0) throw new Error(`${label}: ${n} row(s) visible`);
  return `${label}: 0 rows, no error`;
}

/** Passes when at least one row came back — the positive control for the isolation checks. */
function expectRows(label: string, res: Res): string {
  if (res.error) throw new Error(`${label}: unexpected error ${res.error.message}`);
  const n = res.data?.length ?? 0;
  if (n === 0) throw new Error(`${label}: 0 rows (is the demo data seeded?)`);
  return `${label}: ${n} row(s)`;
}

/** Passes when the write was refused outright or matched nothing. */
function expectRefused(label: string, res: Res): string {
  if (res.error) return `${label}: refused (${res.error.code ?? "error"})`;
  if ((res.data?.length ?? 0) === 0) return `${label}: 0 rows affected`;
  throw new Error(`${label}: write went through`);
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  loadEnv();
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const password = required("DEMO_PASSWORD");
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };

  const admin = createClient<Database>(url, serviceKey, opts);

  // Identities come from profiles (email is mirrored from auth), never from
  // anything the principals themselves can read.
  const { data: rows, error: lookupError } = await admin
    .from("profiles")
    .select("id, email, role, full_name, coach_code")
    .in("email", Object.values(EMAILS));
  if (lookupError) cannotRun(`Cannot read profiles with the service role: ${lookupError.message}`);
  const byEmail = new Map((rows ?? []).map((r) => [r.email, r]));
  const missing = Object.values(EMAILS).filter((e) => !byEmail.has(e));
  if (missing.length) cannotRun(`Demo accounts missing (${missing.join(", ")}) — ${SEED_HINT}.`);
  const A = byEmail.get(EMAILS.a) as Principal;
  const B = byEmail.get(EMAILS.b) as Principal;
  const COACH1 = byEmail.get(EMAILS.coach1) as Principal;
  const COACH2 = byEmail.get(EMAILS.coach2) as Principal;

  async function signIn(email: string): Promise<Client> {
    const client = createClient<Database>(url, anonKey, opts);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) cannotRun(`Cannot sign in as ${email}: ${error.message} — check DEMO_PASSWORD or ${SEED_HINT}.`);
    return client;
  }
  const asA = await signIn(EMAILS.a);
  const asB = await signIn(EMAILS.b);
  const asCoach1 = await signIn(EMAILS.coach1);
  const anon = createClient<Database>(url, anonKey, opts);

  // 1–3. Activities: an athlete sees only their own; a coach sees only their roster.
  await check("athlete cannot read another athlete's activities", async () =>
    expectNoRows("A selects B's activities", await asA.from("activities").select("id").eq("user_id", B.id)),
  );
  await check("coach cannot read a rival coach's athlete", async () =>
    expectNoRows("coach1 selects B's activities", await asCoach1.from("activities").select("id").eq("user_id", B.id)),
  );
  await check("coach reads own roster", async () =>
    expectRows("coach1 selects A's activities", await asCoach1.from("activities").select("id").eq("user_id", A.id).limit(5)),
  );

  // 4. Templates: nothing for the anon role; defaults for every signed-in user;
  //    another coach's methodology for nobody outside that roster.
  await check("plan_templates: anon none, defaults readable, other coach's hidden", async () => {
    const a = await anon.from("plan_templates").select("id").limit(5);
    if (!a.error && (a.data?.length ?? 0) > 0) throw new Error(`anon sees ${a.data?.length} template(s)`);
    const d = expectRows("A selects default templates", await asA.from("plan_templates").select("id").is("coach_id", null).limit(5));
    const o = expectNoRows("A selects coach2's templates", await asA.from("plan_templates").select("id").eq("coach_id", COACH2.id));
    return `anon: ${a.error ? "error" : "0 rows"}; ${d}; ${o}`;
  });

  // 5. Links are created only through join_coach, which owns the code check,
  //    the seat cap and the one-coach rule. A direct insert must not work.
  await check("athlete cannot insert a coach link directly", async () => {
    const link = () => admin.from("coach_athletes").select("id").eq("coach_id", COACH2.id).eq("athlete_id", A.id);
    const before = (await link()).data?.length ?? 0;
    const res = await asA.from("coach_athletes").insert({ coach_id: COACH2.id, athlete_id: A.id, status: "active" }).select("id");
    const after = (await link()).data?.length ?? 0;
    if (after > before) {
      await admin.from("coach_athletes").delete().eq("coach_id", COACH2.id).eq("athlete_id", A.id);
      throw new Error("row was inserted (removed again with the service role)");
    }
    return expectRefused("A inserts (coach2, A)", res);
  });

  // 6. role and coach_code are set once by the product's own writers; a client
  //    role must be refused by the trigger, and the stored value must not move.
  await check("identity columns on profiles are locked", async () => {
    const out: string[] = [];
    const attempts = [
      { key: "role" as const, patch: { role: "coach" as const }, restore: { role: A.role } },
      { key: "coach_code" as const, patch: { coach_code: "HACKED" }, restore: { coach_code: A.coach_code } },
    ];
    for (const { key, patch, restore } of attempts) {
      const res = await asA.from("profiles").update(patch).eq("id", A.id).select("id");
      const { data: now } = await admin.from("profiles").select("role, coach_code").eq("id", A.id).single();
      if (now && now[key] !== A[key]) {
        await admin.from("profiles").update(restore).eq("id", A.id);
        throw new Error(`${key} was changed (restored with the service role)`);
      }
      if (!res.error) throw new Error(`update of ${key} returned no error`);
      out.push(`${key}: refused (${res.error.code}), value unchanged`);
    }
    return out.join("; ");
  });

  // 7. join_coach guards: unknown code, own code, and no e-mail in the name.
  await check("join_coach rejects unknown and own codes, never leaks e-mail", async () => {
    const before = await admin.from("coach_athletes").select("status").eq("coach_id", COACH1.id).eq("athlete_id", A.id).maybeSingle();
    const unknown = await asA.rpc("join_coach", { code: "NOPE00" });
    if (!unknown.error?.message.includes("no coach")) throw new Error(`unknown code: ${unknown.error?.message ?? "no error"}`);
    const own = await asCoach1.rpc("join_coach", { code: "COACH1" });
    if (!own.error?.message.includes("your own")) throw new Error(`own code: ${own.error?.message ?? "no error"}`);
    const rejoin = await asA.rpc("join_coach", { code: "COACH1" });
    if (before.data && before.data.status !== "active") {
      await admin.from("coach_athletes").update({ status: before.data.status }).eq("coach_id", COACH1.id).eq("athlete_id", A.id);
    }
    if (rejoin.error) throw new Error(`rejoin own coach: ${rejoin.error.message}`);
    const name = rejoin.data?.[0]?.coach_name ?? "";
    if (!name || name.includes("@")) throw new Error(`coach_name leaks or is empty: "${name}"`);
    return `unknown → 'no coach'; own → 'your own'; rejoin ok, coach_name "${name}"`;
  });

  // 8. Writes across athletes: the profile update matches nothing, the
  //    activity insert is refused by act_self's WITH CHECK.
  await check("athlete cannot write another athlete's rows", async () => {
    const p = expectRefused(
      "A updates B's profile",
      await asA.from("profiles").update({ full_name: B.full_name }).eq("id", B.id).select("id"),
    );
    const externalId = `permcheck-${Date.now()}`;
    const res = await asA.from("activities").insert({ user_id: B.id, external_id: externalId, source: "manual" }).select("id");
    const { data: leaked } = await admin.from("activities").select("id").eq("user_id", B.id).eq("external_id", externalId);
    if (leaked?.length) {
      await admin.from("activities").delete().eq("user_id", B.id).eq("external_id", externalId);
      throw new Error("activity for B was inserted (removed again with the service role)");
    }
    if (!res.error) throw new Error("activity insert for B returned no error");
    return `${p}; A inserts activity for B: refused (${res.error.code})`;
  });

  await Promise.all([asA, asB, asCoach1].map((c) => c.auth.signOut()));

  const width = Math.max(...results.map((r) => r.name.length));
  console.log("");
  for (const r of results) console.log(`${r.ok ? "✔" : "✘"} ${r.name.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nPermission check failed to run:", err instanceof Error ? err.message : err, "\n");
  process.exit(2);
});
