"use client";

/**
 * The coach's settings.
 *
 * Three things live here, and they have one idea in common: each is a place
 * where the coach's judgement replaces ours.
 *
 *  - **Templates** — how they prepare somebody for a distance.
 *  - **Thresholds** — when they want to be told an athlete needs a look.
 *  - **Colours** — how their calendar reads.
 *
 * The thresholds are the interesting one. `lib/coach/roster.ts` ships five
 * silent days and a load ratio of 1.5, and those are defensible defaults rather
 * than facts — a coach working with beginners wants different numbers from one
 * working with a club. Leaving them hard-coded meant the product had an opinion
 * the coach could not argue with.
 */

import { useState, useTransition } from "react";
import { CoachNav } from "@/components/coach/CoachNav";
import { JoinCode } from "@/components/coach/JoinCode";
import { SignOutButton } from "@/components/SignOutButton";
import { saveCoachPreferences } from "@/actions/coach";
import { DEFAULT_PREFERENCES, type CoachPreferences } from "@/lib/coach/preferences";
import { colorFor, DEFAULT_RACE_COLORS } from "@/lib/coach/calendar";
import { RACE_LABEL, RACE_TYPES } from "@/lib/coach/templates";
import { COACH_COPY } from "@/lib/screens/coachHome";

export function CoachSettingsView({
  preferences,
  code,
  email,
}: {
  preferences: CoachPreferences;
  code: string | null;
  email: string | null;
}) {
  const [prefs, setPrefs] = useState<CoachPreferences>(preferences);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<CoachPreferences>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    setNote("");
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveCoachPreferences(prefs);
      setNote(result.ok ? "Saved." : result.error);
    });
  };

  const restore = () => set({ ...DEFAULT_PREFERENCES, raceColors: {} });

  return (
    <div style={{ maxWidth: "1080px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <CoachNav active="settings" />

      <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>Coach settings</h1>

      <section className="card" style={{ padding: "18px 22px" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{COACH_COPY.prefsTitle}</h2>
        <p style={{ margin: "2px 0 14px", fontSize: "11.5px", color: "var(--color-faint)" }}>{COACH_COPY.prefsSub}</p>

        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
          {RACE_TYPES.map((r) => (
            <label key={r} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <input
                type="color"
                value={colorFor(r, prefs.raceColors)}
                onChange={(e) => set({ raceColors: { ...prefs.raceColors, [r]: e.target.value } })}
                style={{ width: "34px", height: "28px", padding: 0, border: "1px solid var(--color-line-strong)", borderRadius: "6px", background: "transparent", cursor: "pointer" }}
                aria-label={`${RACE_LABEL[r]} colour`}
              />
              <span style={{ fontSize: "12.5px" }}>{RACE_LABEL[r]}</span>
              {prefs.raceColors[r] && prefs.raceColors[r] !== DEFAULT_RACE_COLORS[r] && (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...prefs.raceColors };
                    delete next[r];
                    set({ raceColors: next });
                  }}
                  className="num"
                  style={{ fontSize: "9.5px", color: "var(--color-faint)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  reset
                </button>
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: "18px 22px" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{COACH_COPY.thresholdsTitle}</h2>
        <p style={{ margin: "2px 0 14px", fontSize: "11.5px", color: "var(--color-faint)", maxWidth: "70ch", lineHeight: 1.6 }}>
          {COACH_COPY.thresholdsSub}
        </p>

        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <Number label={COACH_COPY.tSilent} value={prefs.silentDays} min={1} max={30} step={1} onChange={(v) => set({ silentDays: v })} />
          <Number label={COACH_COPY.tOverload} value={prefs.overloadRatio} min={1} max={3} step={0.05} onChange={(v) => set({ overloadRatio: v })} />
          <Number label={COACH_COPY.tUnderload} value={prefs.underloadRatio} min={0.1} max={1} step={0.05} onChange={(v) => set({ underloadRatio: v })} />
          <Number label={COACH_COPY.tReadiness} value={prefs.lowReadiness} min={0} max={100} step={1} onChange={(v) => set({ lowReadiness: v })} />
          <Number label={COACH_COPY.tRaceSoon} value={prefs.raceSoonDays} min={1} max={120} step={1} onChange={(v) => set({ raceSoonDays: v })} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBlockStart: "16px" }}>
          <button className="btn btn-primary" type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={restore}>
            {COACH_COPY.restoreDefaults}
          </button>
          {note && (
            <span className="num" style={{ fontSize: "11.5px", color: note === "Saved." ? "var(--color-positive)" : "var(--color-negative)" }}>
              {note}
            </span>
          )}
        </div>
      </section>

      <section className="card" style={{ padding: "18px 22px" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Training templates</h2>
        <p style={{ margin: "2px 0 12px", fontSize: "11.5px", color: "var(--color-faint)", maxWidth: "70ch", lineHeight: 1.6 }}>
          How you prepare somebody for each distance. Applied to whoever is training for it — edit a
          template and the change reaches the next athlete to start, never one already running a plan.
        </p>
        <a className="btn btn-secondary" href="/coach/templates" style={{ display: "inline-block" }}>
          Edit templates
        </a>
      </section>

      <div style={{ width: "min(360px, 100%)" }}>
        <JoinCode code={code} />
      </div>

      <section className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 500 }}>Signed in as {email ?? "—"}</p>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>
            Account details and password live on the athlete settings screen.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <a className="btn btn-secondary" href="/settings">Account</a>
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}

function Number({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
        {label}
      </span>
      <input
        className="field"
        type="number"
        value={String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = globalThis.Number(e.target.value);
          if (globalThis.Number.isFinite(v)) onChange(v);
        }}
        style={{ width: "92px", textAlign: "center" }}
      />
    </label>
  );
}
