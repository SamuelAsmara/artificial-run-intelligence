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
import { saveCoachPreferences } from "@/actions/coach";
import { DEFAULT_PREFERENCES, type CoachPreferences } from "@/lib/coach/preferences";
import { colorFor, DEFAULT_RACE_COLORS } from "@/lib/coach/calendar";
import { RACE_LABEL, RACE_TYPES } from "@/lib/coach/templates";
import { COACH_COPY } from "@/lib/screens/coachHome";
import { ProfileCard, ConnectionsCard, SettingsTabs, AccountPanel, TAB_ICONS } from "@/components/screens/SettingsView";
import { Entrance } from "@/components/ui";
import type { AthleteProfileView } from "@/actions/profile";
import type { ProviderConnectionView } from "@/actions/providers";

/**
 * The coach's settings — all of them, on one page.
 *
 * A coach used to have two settings screens: this one for preferences,
 * thresholds and templates, and the athlete screen for their profile, their
 * connections and their password, reached by an "Account" button. Two screens
 * called Settings is a contradiction, and the button was the tell: it existed
 * because half the page was somewhere else.
 *
 * So the athlete cards are rendered here, as themselves — the same components,
 * not copies, so the two can never drift apart.
 */
export function CoachSettingsView({
  preferences,
  code,
  email,
  profile = null,
  icuConnection = null,
}: {
  preferences: CoachPreferences;
  code: string | null;
  email: string | null;
  profile?: AthleteProfileView | null;
  icuConnection?: ProviderConnectionView | null;
}) {
  const [prefs, setPrefs] = useState<CoachPreferences>(preferences);
  const [note, setNote] = useState("");
  /*
   * The colour pickers are folded away by default. Four colour inputs are the
   * least-touched control on this page — most coaches set them once or never —
   * and open they pushed the thresholds, the profile and the account below
   * the fold. The header row still shows the four current colours, so the
   * closed state answers "what are my colours" without opening anything.
   */
  const [colorsOpen, setColorsOpen] = useState(false);
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
    <div data-entrance-root style={{ maxWidth: "1080px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <CoachNav active="settings" />

      <div style={{ textAlign: "start" }}>
        <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>About you</h1>
        <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>Personal details · coaching · connections · account & security</p>
      </div>

      {/* The coach's own details first — the same card every athlete sees.
          Everything else sits behind one row of tabs, same as the athlete's
          settings: one open at a time, a second click closes it. */}
      <ProfileCard profile={profile} />

      <SettingsTabs
        tabs={[
          {
            key: "coaching", label: "Coaching", icon: TAB_ICONS.coaching,
            hint: code ? `Code ${code}` : "Thresholds · colours · templates",
            panel: (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="cs-two">
                  <div style={{ width: "min(360px, 100%)" }}>
        <JoinCode code={code} />
                  </div>
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
                </div>
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
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setColorsOpen((v) => !v)}
          aria-expanded={colorsOpen}
          className="dc-hover-bg"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "12px", padding: "14px 22px", background: colorsOpen ? "var(--color-elevated)" : "transparent",
            border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--color-ink)", textAlign: "start",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{COACH_COPY.prefsTitle}</h2>
            <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{COACH_COPY.prefsSub}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* the four current colours, visible without opening anything */}
            <span style={{ display: "flex", gap: "5px" }}>
              {RACE_TYPES.map((r) => (
                <span key={r} style={{ width: "12px", height: "12px", borderRadius: "3px", background: colorFor(r, prefs.raceColors) }} />
              ))}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: colorsOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </button>
        {colorsOpen ? (
          <div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "16px 22px 18px" }}>
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
          </div>
        ) : null}
      </section>
              </div>
            ),
          },
          {
            key: "connections", label: "Connections", icon: TAB_ICONS.connections,
            hint: icuConnection ? (icuConnection.status === "connected" ? "Connected" : "Needs attention") : "Not connected",
            panel: <ConnectionsCard connection={icuConnection} />,
          },
          {
            key: "account", label: "Account & security", icon: TAB_ICONS.account,
            hint: email ?? "",
            panel: <AccountPanel email={email} title={COACH_COPY.accountTitle} sub={COACH_COPY.accountSub} />,
          },
        ]}
      />
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
