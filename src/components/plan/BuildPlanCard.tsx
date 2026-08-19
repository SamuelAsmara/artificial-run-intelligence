"use client";

/**
 * The empty state on /plan, with the button that was missing.
 *
 * ## What was wrong
 *
 * The card used to be a paragraph and a link to Settings. An athlete who had
 * *already* set a goal race in Settings was sent back to the screen they had
 * just come from, told to do the thing they had just done. Nothing anywhere in
 * the application called the plan generator, so no plan could ever exist, and
 * everything downstream of one — the dashboard week strip, the calendar's
 * planned/missed dots, planned-vs-actual on an activity, the coach's calendar —
 * was permanently empty for every user.
 *
 * ## Two states, because there are two situations
 *
 * No race set yet: the honest next step really is Settings.
 * Race set: one button, and it builds.
 *
 * Generation can legitimately refuse — a race eight days away, or an account
 * with no run history to size the weeks against. Those refusals are shown, not
 * swallowed, because they tell the athlete exactly what to change.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildPlanForActiveRace } from "@/actions/plan";
import { PLAN_EMPTY } from "@/lib/screens/plan";

export function BuildPlanCard({
  hasRace,
  raceLine,
}: {
  hasRace: boolean;
  raceLine: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const build = () => {
    setError("");
    setNotes([]);
    startTransition(async () => {
      const result = await buildPlanForActiveRace();
      if (result.error) return setError(result.error);
      /*
       * The action revalidates /plan, but this component is already mounted on
       * it — without the refresh the athlete presses "Build my plan", the
       * button stops spinning, and the same empty card stares back.
       */
      setNotes(result.data?.notes ?? []);
      router.refresh();
    });
  };

  return (
    <section className="card" style={{ padding: "40px 26px", textAlign: "center" }}>
      <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{PLAN_EMPTY.title}</h2>
      <p style={{
        margin: "10px auto 0", fontSize: "13px", color: "var(--color-muted)",
        maxWidth: "52ch", lineHeight: 1.7,
      }}>
        {hasRace ? PLAN_EMPTY.bodyWithRace : PLAN_EMPTY.body}
      </p>

      {hasRace && raceLine ? (
        <p className="num" style={{ margin: "12px 0 0", fontSize: "12.5px", color: "var(--color-ink)" }}>
          {raceLine}
        </p>
      ) : null}

      {hasRace ? (
        <button
          className="btn btn-primary"
          type="button"
          onClick={build}
          disabled={pending}
          style={{ marginBlockStart: "18px", cursor: pending ? "progress" : "pointer" }}
        >
          {pending ? PLAN_EMPTY.building : PLAN_EMPTY.build}
        </button>
      ) : (
        <a className="btn btn-primary" href="/settings" style={{ display: "inline-block", marginBlockStart: "18px" }}>
          {PLAN_EMPTY.cta}
        </a>
      )}

      {error ? (
        <p style={{
          margin: "14px auto 0", fontSize: "12.5px", color: "var(--color-negative)",
          maxWidth: "52ch", lineHeight: 1.6,
        }}>
          {error}
        </p>
      ) : null}

      {/*
        Capacity notes are warnings, not failures — "your longest run this month
        is 9 km and the race is 42.2" is exactly what an athlete needs to read
        before week one, and exactly what nobody reads if it is only in a log.
      */}
      {notes.length > 0 ? (
        <ul style={{
          margin: "14px auto 0", padding: 0, listStyle: "none", maxWidth: "52ch",
          display: "flex", flexDirection: "column", gap: "6px",
        }}>
          {notes.map((note) => (
            <li key={note} style={{ fontSize: "12px", color: "var(--color-caution)", lineHeight: 1.6 }}>
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
