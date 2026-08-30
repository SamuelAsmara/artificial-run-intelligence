"use client";

/**
 * The way out of a training plan.
 *
 * Two clicks, not one — leaving discards nothing (the plan is marked, never
 * deleted, and the runs behind it stay), but it does dissolve weeks of
 * structure, so the first click asks and the second acts. Two clicks, not a
 * modal: a confirmation dialog for an act this reversible would be theatre.
 *
 * Styled to be findable rather than prominent. The athlete who wants to leave
 * scrolls to the end of the plan and finds the door; nobody else has it
 * competing with their next session.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abandonPlan } from "@/actions/plan";

const COPY = {
  prompt: "Leave this plan…",
  confirm: "Leave the plan",
  keep: "Keep training",
  leaving: "Leaving…",
  explain:
    "The plan is closed, not deleted — your runs and history stay. You can build a new plan for this race, or a different one, right after.",
} as const;

export function LeavePlan() {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const leave = () => {
    setError("");
    startTransition(async () => {
      const result = await abandonPlan();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (!asking) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="num"
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "4px 2px",
            fontSize: "11px", color: "var(--color-faint)", textDecoration: "underline",
            textUnderlineOffset: "3px", fontFamily: "inherit",
          }}
        >
          {COPY.prompt}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "14px 18px", borderColor: "var(--color-line-strong)" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)", lineHeight: 1.6, textWrap: "pretty" }}>
        {COPY.explain}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBlockStart: "12px", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" type="button" onClick={leave} disabled={pending}>
          {pending ? COPY.leaving : COPY.confirm}
        </button>
        <button className="btn btn-primary" type="button" onClick={() => setAsking(false)} disabled={pending}>
          {COPY.keep}
        </button>
        {error ? (
          <span className="num" style={{ fontSize: "11.5px", color: "var(--color-negative)" }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}
