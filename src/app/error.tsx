"use client";

/**
 * What a crash looks like.
 *
 * Without this a thrown error anywhere under the root layout is Next's white
 * page and a stack trace nobody can act on. This keeps the athlete inside
 * Runi: says something went wrong in plain words, offers to try again (which
 * re-renders the segment) and a way home. The error itself goes to the
 * console, which in production is the Vercel function log.
 */

import { useEffect } from "react";
import { BrandMark } from "@/components/ui/BrandMark";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[runi] page error", error.digest ?? "", error); }, [error]);
  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <section className="card" style={{ maxWidth: "460px", width: "100%", padding: "28px 28px 24px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "9px", marginBlockEnd: "14px" }}>
          <BrandMark size={22} /><span className="num" style={{ fontWeight: 500, fontSize: "15px", letterSpacing: ".12em" }}>Runi</span>
        </div>
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Something went wrong on this page</h1>
        <p style={{ margin: "8px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.65 }}>
          Your data is safe — this is the page, not your runs. Try again; if it keeps happening, go home and come back to it.
        </p>
        {error.digest ? <p className="num" style={{ margin: "10px 0 0", fontSize: "10px", color: "var(--color-faint)" }}>ref {error.digest}</p> : null}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBlockStart: "18px", flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="button" onClick={reset}>Try again</button>
          <a className="btn btn-secondary" href="/dashboard">Home</a>
        </div>
      </section>
    </main>
  );
}
