"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseCoachPlan } from "@/actions/billing";
import { COACH_PLANS, seatsLabel, type CoachTier } from "@/lib/billing/plans";

/**
 * Basic or Premium — the coach's package, chosen inside Settings → Billing.
 *
 * This used to be a page of its own, and a new coach was sent there before
 * the workspace opened. A page that exists only to be clicked through is a
 * detour; here the two cards sit where the rest of the coach's account lives,
 * and picking one writes the choice and refreshes the page — the coach never
 * leaves Settings.
 *
 * Two cards in the same shape as the three plan paths on the athlete's /plan
 * screen, so a coach who is also a runner meets one language. The current
 * package is marked; the other one has the button.
 *
 * No price is charged in this version and the card says so under the
 * Premium button. A screen that looks like a checkout and is not one would
 * be the wrong kind of demo.
 */
export function CoachPlanCards({ current, athletes }: { current: CoachTier | null; athletes: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<CoachTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CoachTier | null>(null);

  const choose = (tier: CoachTier) => {
    setError(null);
    setSaved(null);
    setPicked(tier);
    startTransition(async () => {
      const r = await chooseCoachPlan(tier);
      setPicked(null);
      if (r.error) { setError(r.error); return; }
      setSaved(tier);
      router.refresh();
    });
  };

  const tiers: CoachTier[] = ["basic", "premium"];

  return (
    <section className="card" style={{ padding: "18px 24px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <p className="num" style={{ margin: 0, fontSize: "10px", letterSpacing: ".12em", color: "var(--color-faint)" }}>PACKAGE</p>
          <p style={{ margin: "4px 0 0", fontSize: "15px", fontWeight: 600 }}>
            {current ? COACH_PLANS[current].name : "No package yet"}
            {current === "premium" ? <span className="tag" style={{ marginInlineStart: "8px", background: "var(--color-gold-soft)", color: "var(--color-gold)" }}>Premium</span> : null}
          </p>
          <p className="num" style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>
            {current ? seatsLabel(current, athletes) : `${athletes} athletes on your roster · pick a package below`}
          </p>
        </div>
        {saved ? (
          <span className="num" style={{ fontSize: "11.5px", color: "var(--color-positive)" }}>Saved — you are on {COACH_PLANS[saved].name}.</span>
        ) : null}
      </div>

      <div className="ps-paths ps-paths-2" style={{ marginBlockStart: "16px", marginBlockEnd: 0 }}>
        {tiers.map((tier) => {
          const plan = COACH_PLANS[tier];
          const on = current === tier;
          const busy = pending && picked === tier;
          const over = tier === "basic" && athletes > plan.seatLimit;
          return (
            <div key={tier} className={`card ps-path${on ? " is-open" : ""}`} style={{ cursor: "default", alignItems: "stretch", padding: "18px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: "15px", fontWeight: 700 }}>{plan.name}</span>
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
              <div style={{ marginBlockStart: "auto", paddingBlockStart: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {on ? (
                  <span className="tag" style={{ alignSelf: "center", background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>Your current package</span>
                ) : (
                  <button type="button" className={tier === "premium" ? "btn btn-primary" : "btn btn-secondary"} onClick={() => choose(tier)} disabled={pending || over} style={{ width: "100%" }}>
                    {busy ? "Saving…" : tier === "premium" ? "Go Premium" : current ? "Move to Basic" : "Start with Basic"}
                  </button>
                )}
                {tier === "premium" && !on ? (
                  <span className="num" style={{ fontSize: "10.5px", color: "var(--color-faint)", textAlign: "center" }}>No charge in this version — billing is not connected yet.</span>
                ) : null}
                {over ? (
                  <span className="num" style={{ fontSize: "10.5px", color: "var(--color-caution)", textAlign: "center" }}>Your roster already has {athletes} athletes — more than Basic allows.</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p role="alert" style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--color-negative)" }}>{error}</p> : null}
      <p className="num" style={{ margin: "12px 0 0", fontSize: "10.5px", color: "var(--color-faint)", lineHeight: 1.6 }}>
        A seat is one active athlete on your roster. Athletes join with your code and can leave at any time; leaving frees the seat.
      </p>
    </section>
  );
}
