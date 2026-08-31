/**
 * A page that does not exist — a mistyped link, a run that was never yours,
 * a screen that moved. Says so and points home; never a stack trace.
 */

import { BrandMark } from "@/components/ui/BrandMark";

export default function NotFound() {
  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <section className="card" style={{ maxWidth: "440px", width: "100%", padding: "28px 28px 24px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "9px", marginBlockEnd: "14px" }}>
          <BrandMark size={22} /><span className="num" style={{ fontWeight: 500, fontSize: "15px", letterSpacing: ".12em" }}>Runi</span>
        </div>
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Nothing here</h1>
        <p style={{ margin: "8px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.65 }}>
          That page does not exist, or it is not yours to see. The home screen has everything that is.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBlockStart: "18px" }}>
          <a className="btn btn-primary" href="/dashboard">Home</a>
          <a className="btn btn-secondary" href="/">Front page</a>
        </div>
      </section>
    </main>
  );
}
