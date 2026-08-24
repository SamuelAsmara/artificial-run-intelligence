"use client";

/**
 * The empty state on /plan — where an athlete without a coach starts.
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
 * Race set: one button, and it builds.
 *
 * No race yet: the distance and the date, asked for here. This used to be a
 * link to Settings, which is the wrong answer to "I want a plan" — it sends
 * someone off the screen that needs the answer, to fill in a field on a screen
 * about something else, and then walk back. The two facts a plan is built from
 * are a distance and a day, so they are asked for where the plan is.
 *
 * Generation can legitimately refuse — a race eight days away, or an account
 * with no run history to size the weeks against. Those refusals are shown, not
 * swallowed, because they tell the athlete exactly what to change.
 */

import type * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildPlanForActiveRace } from "@/actions/plan";
import { createGoalRace } from "@/actions/goalRace";
import { PLAN_EMPTY } from "@/lib/screens/plan";
import { FilterChip } from "@/components/ui";

type RaceType = "5k" | "10k" | "half" | "full";

/**
 * The soonest a plan is worth building.
 *
 * The generator refuses a race that is days away, and it is kinder to say so
 * before the athlete fills the form in than after.
 */
const MIN_DAYS = 14;

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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

  // The goal-race form, for the athlete who has not set one.
  const [raceType, setRaceType] = useState<RaceType>("10k");
  const [raceDate, setRaceDate] = useState("");
  const [targetTime, setTargetTime] = useState("");

  const createRace = () => {
    setError("");
    setNotes([]);
    if (!raceDate) return setError(PLAN_EMPTY.raceDateMissing);
    startTransition(async () => {
      // createGoalRace saves the race *and* runs the generator, so there is one
      // button here rather than a save followed by a build.
      const result = await createGoalRace({
        raceType,
        raceDate,
        targetTime: targetTime.trim() || undefined,
      });
      if (result.error) return setError(result.error);
      router.refresh();
    });
  };

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
      <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
        {hasRace ? PLAN_EMPTY.title : PLAN_EMPTY.raceHeading}
      </h2>
      <p style={{
        margin: "10px auto 0", fontSize: "13px", color: "var(--color-muted)",
        maxWidth: "52ch", lineHeight: 1.7,
      }}>
        {hasRace ? PLAN_EMPTY.bodyWithRace : PLAN_EMPTY.raceBody}
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
        <div style={{ maxWidth: "460px", marginInline: "auto", marginBlockStart: "22px", textAlign: "start" }}>
          <Field label={PLAN_EMPTY.raceDistance}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {PLAN_EMPTY.raceTypes.map((r) => (
                <FilterChip
                  key={r.id}
                  active={raceType === r.id}
                  onClick={() => setRaceType(r.id as RaceType)}
                >
                  {r.label}
                  <span className="num" style={{ marginInlineStart: "6px", fontSize: "10.5px", opacity: 0.7 }}>
                    {r.km}
                  </span>
                </FilterChip>
              ))}
            </div>
          </Field>

          <Field label={PLAN_EMPTY.raceDate}>
            <input
              type="date"
              value={raceDate}
              min={isoIn(MIN_DAYS)}
              onChange={(e) => setRaceDate(e.target.value)}
              style={INPUT}
            />
          </Field>

          <Field label={PLAN_EMPTY.raceTarget} hint={PLAN_EMPTY.raceTargetHint}>
            <input
              type="text"
              inputMode="numeric"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder={PLAN_EMPTY.raceTargetPlaceholder}
              style={INPUT}
            />
          </Field>

          <button
            className="btn btn-primary"
            type="button"
            onClick={createRace}
            disabled={pending}
            style={{ width: "100%", marginBlockStart: "18px", cursor: pending ? "progress" : "pointer" }}
          >
            {pending ? PLAN_EMPTY.raceSubmitting : PLAN_EMPTY.raceSubmit}
          </button>
        </div>
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

const INPUT: React.CSSProperties = {
  width: "100%",
  height: "38px",
  padding: "0 11px",
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-elevated)",
  color: "var(--color-ink)",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  boxSizing: "border-box",
};

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBlockStart: "14px" }}>
      <span style={{
        display: "inline-flex", alignItems: "baseline", gap: "6px",
        fontSize: "10px", fontWeight: 600, letterSpacing: ".1em",
        textTransform: "uppercase", color: "var(--color-faint)",
      }}>
        {label}
        {hint ? (
          <span style={{ letterSpacing: 0, textTransform: "none", fontWeight: 400, opacity: 0.8 }}>
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}
