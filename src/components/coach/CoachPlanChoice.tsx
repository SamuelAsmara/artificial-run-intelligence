"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseCoachPlan } from "@/actions/billing";
import { COACH_PLANS, seatsLabel, type CoachTier } from "@/lib/billing/plans";
import { BrandMark } from "@/components/ui";

/**
 * Basic or Premium — the page a new coach lands on, and the page a coach
 * comes back to from settings.
 *
 * Two cards in the same shape as the three plan paths on the athlete's
 * /plan screen, so a coach who is also a runner meets one language. The
 * current package is marked; picking the other one writes it and returns
 * to the workspace.
 *
 * No price is charged in this version and the page says so under the
 * Premium button. A screen that looks like a checkout and is not one would
 * be the wrong kind of demo.
 */
export function CoachPlanChoice({
  current, athletes, first,
}: {
  current: CoachTier | null;
  athletes: number;
  first: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<CoachTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = (tier: CoachTier) => {
    setError(null);
    setPicked(tier);
    startTransition(async () => {
      const r = await chooseCoachPlan(tier);
      if (r.error) { setError(r.error); setPicked(null); return; }
      router.push("/coach");
      router.refresh();
    });
  };

  const tiers: CoachTier[] = ["basic", "premium"];

  return (
    <div data-entrance-root style={{ maxWidth: "860px", marginInline: "auto", padding: "32px 24px 60px", display: "flex", flexDirection: "column", gap: "18px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <BrandMark />
        <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>Runi</span>
        <span style={{ fontSize: "11px", color: "var(--color-faint)", marginInlineStart: "auto", whiteSpace: "nowrap" }} className="num">COACH ACCOUNT</span>
      </header>

      <section className="card" style={{ padding: "26px 28px 22px", textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          {first ? "Welcome, coach. Pick your package." : "Your package"}
        </h1>
        <p style={{ margin: "8px auto 0", fontSize: "12.5px", color: "var(--color-muted)", maxWidth: "56ch", lineHeight: 1.65 }}>
          {first
            ? "Athletes always train on Runi for free. Coaches choose how many they bring. You can change this later in Settings."
            : `You are on ${current ? COACH_PLANS[current].name : "no package yet"} · ${current ? seatsLabel(current, athletes) : `${athletes} athletes`}.`}
        </p>

        <div className="ps-paths ps-paths-2" style={{ marginBlockStart: "22px" }}>
          {tiers.map((tier) => {
            const plan = COACH_PLANS[tier];
            const on = current === tier;
            const busy = pending && picked === tier;
            const over = tier === "basic" && athletes > plan.seatLimit;
            return (
              <div key={tier} className={`card ps-path${on ? " is-open" : ""}`} style={{ cursor: "default", alignItems: "stretch", padding: "20px 20px 18px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 700 }}>{plan.name}</span>
                  <span className="num" style={{ fontSize: "10.5px", color: tier === "premium" ? "var(--color-gold)" : "var(--color-muted)", letterSpacing: ".06em", textAlign: "end" }}>{plan.price.toUpperCase()}</span>
                </div>
                <p style={{ margin: "4px 0 12px", fontSize: "12px", color: "var(--color-muted)" }}>{plan.tagline}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px", textAlign: "start" }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12.5px", lineHeight: 1.45 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--color-accent)", flex: "none", marginBlockStart: "2px" }}><path d="M20 6 9 17l-5-5" /></svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginBlockStart: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {on ? (
                    <span className="tag" style={{ alignSelf: "center", background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>Your current package</span>
                  ) : (
                    <button type="button" className={tier === "premium" ? "btn btn-primary" : "btn btn-secondary"} onClick={() => choose(tier)} disabled={pending || over} style={{ width: "100%" }}>
                      {busy ? "Saving…" : tier === "premium" ? "Go Premium" : "Start with Basic"}
                    </button>
                  )}
                  {tier === "premium" && !on ? (
                    <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>No charge in this version — billing is not connected yet.</span>
                  ) : null}
                  {over ? (
                    <span className="num" style={{ fontSize: "10.5px", color: "var(--color-caution)" }}>Your roster already has {athletes} athletes — more than Basic allows.</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {error ? <p role="alert" style={{ margin: "14px 0 0", fontSize: "12px", color: "var(--color-negative)" }}>{error}</p> : null}
        {!first ? (
          <p style={{ margin: "16px 0 0", fontSize: "11.5px" }}>
            <a href="/coach/settings" style={{ color: "var(--color-muted)" }}>← Back to settings</a>
          </p>
        ) : null}
      </section>

      <p className="num" style={{ margin: 0, fontSize: "10.5px", color: "var(--color-faint)", textAlign: "center", lineHeight: 1.6 }}>
        A seat is one active athlete on your roster. Athletes join with your code and can leave at any time; leaving frees the seat.
      </p>
    </div>
  );
}
