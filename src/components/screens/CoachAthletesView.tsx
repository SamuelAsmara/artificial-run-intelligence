"use client";

/**
 * The roster: everybody, with the columns a coach actually scans.
 *
 * Photo, name, age, cycle, goal time, goal pace — the things you use to decide
 * who to open. Readiness and load live here too, but further right: they change
 * daily, and a list you re-read every morning should be stable on the left.
 */

import { useMemo, useState } from "react";
import { Entrance } from "@/components/ui";
import { CoachNav } from "@/components/coach/CoachNav";
import type { CoachWorkspace, CoachRosterRow } from "@/actions/coach";
import { applyFilter, buildCycles, EMPTY_FILTER, type RosterFilter } from "@/lib/coach/programs";
import type { RaceType } from "@/types/database.types";
import { colorFor } from "@/lib/coach/calendar";
import { RACE_LABEL } from "@/lib/coach/templates";
import { formatMinSec } from "@/lib/format/pace";
import { Avatar } from "@/components/ui/Avatar";
import {
  COACH_COPY, formColor, loadColor, readinessColor, sinceLabel, untilLabel,
} from "@/lib/screens/coachHome";

const FAINT = "var(--color-faint)";

export function CoachAthletesView({ data, today }: { data: CoachWorkspace; today: string }) {
  const { roster, flags, preferences } = data;
  const flaggedIds = useMemo(() => new Set(flags.map((f) => f.athleteId)), [flags]);
  const { cycles } = useMemo(
    () => buildCycles(roster, today, flaggedIds),
    [roster, today, flaggedIds],
  );

  const [filter, setFilter] = useState<RosterFilter>(EMPTY_FILTER);
  /*
   * Two levels: the distance, then the cycle within it. A coach with two
   * half-marathon groups (Tel Aviv, Jerusalem) picks "Half marathon" and sees
   * both cycles as chips; picking one narrows to its members. Cycles the coach
   * created come first; athletes not in one are still reachable through the
   * derived group (same race, same date).
   */
  const [distance, setDistance] = useState<RaceType | null>(null);
  const distances = useMemo(() => {
    const set = new Set<RaceType>();
    roster.forEach((a) => { if (a.raceType) set.add(a.raceType); });
    return (["5k", "10k", "half", "full"] as RaceType[]).filter((rt) => set.has(rt));
  }, [roster]);
  const cycleChips = useMemo(() => {
    const managed = new Map<string, { id: string; name: string; raceType: RaceType; count: number }>();
    for (const a of roster) {
      if (!a.managedCycleId || !a.raceType) continue;
      const cur = managed.get(a.managedCycleId);
      if (cur) cur.count += 1; else managed.set(a.managedCycleId, { id: a.managedCycleId, name: a.managedCycleName ?? "Cycle", raceType: a.raceType, count: 1 });
    }
    const derived = cycles
      .filter((c) => c.athletes.some((x) => !(x as (typeof roster)[number]).managedCycleId))
      .map((c) => ({ id: c.id, name: `${RACE_LABEL[c.raceType]} · ${untilLabel(c.raceDate, today)}`, raceType: c.raceType, count: c.athletes.filter((x) => !(x as (typeof roster)[number]).managedCycleId).length, derived: true as const }));
    return [...[...managed.values()].map((m) => ({ ...m, derived: false as const })), ...derived]
      .filter((c) => !distance || c.raceType === distance)
      .sort((a, b) => Number(a.derived) - Number(b.derived) || a.name.localeCompare(b.name));
  }, [roster, cycles, distance, today]);

  const shown = useMemo(
    () => applyFilter(roster, filter, (a) => a.managedCycleId ?? a.cycleId).filter((a) => !distance || a.raceType === distance),
    [roster, filter, distance],
  );

  const set = (patch: Partial<RosterFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const active =
    distance !== null || filter.cycles.length > 0 || filter.sex !== null || filter.paceFrom !== null || filter.paceTo !== null;

  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <CoachNav active="athletes" />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>{COACH_COPY.athletesTitle}</h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{COACH_COPY.athletesSub}</p>
        </div>
        <span className="num" style={{ fontSize: "11px", color: FAINT }}>
          {shown.length === roster.length
            ? `${roster.length} ${roster.length === 1 ? "athlete" : "athletes"}`
            : `${shown.length} of ${roster.length}`}
        </span>
      </div>

      <section className="card" style={{ padding: "14px 20px", display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <Field label="Distance">
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            <Chip on={distance === null} onClick={() => { setDistance(null); set({ cycles: [] }); }}>All</Chip>
            {distances.map((rt) => (
              <Chip key={rt} on={distance === rt} onClick={() => { setDistance((d: RaceType | null) => (d === rt ? null : rt)); set({ cycles: [] }); }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: colorFor(rt, preferences.raceColors), display: "inline-block" }} />
                {RACE_LABEL[rt]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={COACH_COPY.fCycle}>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {cycleChips.map((c) => {
              const on = filter.cycles.includes(c.id);
              return (
                <Chip key={c.id} on={on} onClick={() => set({ cycles: on ? filter.cycles.filter((x) => x !== c.id) : [...filter.cycles, c.id] })} title={c.derived ? "Not in a cycle yet — grouped by goal race" : "A cycle you run"}>
                  <span style={{ width: "8px", height: "8px", borderRadius: c.derived ? "50%" : "2px", background: colorFor(c.raceType, preferences.raceColors), display: "inline-block", opacity: c.derived ? 0.6 : 1 }} />
                  {c.name}
                  <span className="num" style={{ fontSize: "9.5px", opacity: 0.7 }}>{c.count}</span>
                </Chip>
              );
            })}
            {cycleChips.length === 0 && <span className="num" style={{ fontSize: "11px", color: FAINT }}>—</span>}
          </div>
        </Field>

        <Field label={COACH_COPY.fSex}>
          <div style={{ display: "flex", gap: "5px" }}>
            {[
              { key: null, label: COACH_COPY.anyOption },
              { key: "male", label: "Men" },
              { key: "female", label: "Women" },
            ].map((o) => {
              const on = filter.sex === o.key;
              return (
                <button
                  key={o.label}
                  className="tag"
                  type="button"
                  onClick={() => set({ sex: o.key })}
                  style={{
                    cursor: "pointer",
                    border: `1px solid ${on ? "transparent" : "var(--color-line-strong)"}`,
                    background: on ? "var(--color-accent)" : "transparent",
                    color: on ? "var(--color-accent-ink)" : "var(--color-muted)",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={`${COACH_COPY.fPace} (min/km)`}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <PaceInput value={filter.paceFrom} onChange={(v) => set({ paceFrom: v })} placeholder="from" />
            <span className="num" style={{ fontSize: "11px", color: FAINT }}>–</span>
            <PaceInput value={filter.paceTo} onChange={(v) => set({ paceTo: v })} placeholder="to" />
          </div>
        </Field>

        {active && (
          <button className="btn btn-secondary" type="button" onClick={() => { setFilter(EMPTY_FILTER); setDistance(null); }} style={{ padding: "6px 12px", fontSize: "11.5px" }}>
            {COACH_COPY.clearAll}
          </button>
        )}
      </section>

      <section className="card" style={{ padding: "16px 20px", overflowX: "auto" }}>
        <div style={{ minWidth: "880px" }}>
          <div
            className="num"
            style={{ display: "grid", gridTemplateColumns: "minmax(190px,1.6fr) .5fr 1fr .7fr .7fr .6fr .6fr .8fr .8fr", gap: "10px", padding: "0 10px 8px", borderBlockEnd: "1px solid var(--color-line)" }}
          >
            {[
              COACH_COPY.hAthlete, COACH_COPY.hAge, COACH_COPY.hPlan, COACH_COPY.hTarget,
              COACH_COPY.hPace, COACH_COPY.hReadiness, COACH_COPY.hForm, COACH_COPY.hLoad, COACH_COPY.hLastRun,
            ].map((h, i) => (
              <span key={h} style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: FAINT, textAlign: i >= 5 ? "end" : "start" }}>
                {h}
              </span>
            ))}
          </div>

          {shown.length === 0 ? (
            /*
             * Two different situations wore the same sentence. A coach with an
             * empty roster and no filters set was told "Nobody matches those
             * filters" — a false explanation, and no next step. What they need
             * is the join code.
             */
            <p style={{ margin: "16px 0 0", fontSize: "12.5px", color: FAINT, textAlign: "center", lineHeight: 1.7 }}>
              {roster.length === 0 ? COACH_COPY.rosterEmpty : COACH_COPY.rosterFiltered}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {shown.map((a) => (
                <Row key={a.id} a={a} today={today} flagged={flaggedIds.has(a.id)} colors={preferences.raceColors} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      className="tag"
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      style={{
        cursor: "pointer", gap: "6px",
        border: `1px solid ${on ? "var(--color-accent)" : "var(--color-line-strong)"}`,
        background: on ? "var(--color-accent-soft)" : "transparent",
        color: on ? "var(--color-ink)" : "var(--color-muted)",
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: FAINT }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/** Accepts "4:30" or "4.5" and stores seconds per kilometre. */
function PaceInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  /*
   * The draft the coach is mid-way through typing.
   *
   * `null` means "show whatever the parent holds" — which is how pressing Clear
   * empties the box. This used to be seeded from `value` once and never resynced,
   * so Clear reset the filter, brought the whole roster back, and left "4:30" and
   * "5:30" sitting in the two inputs: a screen claiming to be filtered when it
   * was not.
   *
   * It cannot be fully controlled either: "4:" is a legal thing to have typed
   * and parses to nothing, and echoing the parsed value back would delete the
   * colon under the coach's cursor.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value === null ? "" : formatMinSec(value));

  const commit = (raw: string) => {
    setDraft(raw);
    const t = raw.trim();
    if (t === "") return onChange(null);
    const parts = t.split(":");
    if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
      return onChange(Number(parts[0]) * 60 + Number(parts[1]));
    }
    const asMinutes = Number(t);
    if (Number.isFinite(asMinutes) && asMinutes > 0) return onChange(Math.round(asMinutes * 60));
    onChange(null);
  };

  return (
    <input
      className="field"
      value={text}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => setDraft(null)}
      placeholder={placeholder}
      style={{ width: "72px", fontSize: "11.5px", textAlign: "center" }}
    />
  );
}

function Row({
  a,
  today,
  flagged,
  colors,
}: {
  a: CoachRosterRow;
  today: string;
  flagged: boolean;
  colors: Record<string, string>;
}) {
  return (
    <a
      className="dc-hover-bg"
      href={`/coach/athletes/${a.id}`}
      style={{ display: "grid", gridTemplateColumns: "minmax(190px,1.6fr) .5fr 1fr .7fr .7fr .6fr .6fr .8fr .8fr", gap: "10px", alignItems: "center", padding: "9px 10px", borderRadius: "var(--radius-control)" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        {/* Not zoomable: the whole row is a link, and a button inside a link
            is invalid markup and swallows the navigation. */}
        <Avatar src={a.avatarUrl} name={a.name} size={32} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {a.name}
          </span>
          {flagged && (
            <span className="num" style={{ display: "block", fontSize: "9.5px", color: "var(--color-negative)" }}>
              needs a look
            </span>
          )}
        </span>
      </span>

      <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{a.age ?? "—"}</span>

      <span style={{ minWidth: 0 }}>
        {a.raceType ? (
          <span style={{ display: "inline-flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
            <span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-muted)", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: colorFor(a.raceType, colors), display: "inline-block" }} />
              {RACE_LABEL[a.raceType]}
            </span>
            {a.managedCycleName ? <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>{a.managedCycleName}</span> : null}
          </span>
        ) : (
          <span className="num" style={{ fontSize: "11px", color: "var(--color-caution)" }}>no race</span>
        )}
      </span>

      <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>{a.targetTime ?? "—"}</span>
      <span className="num" style={{ fontSize: "12px", color: "var(--color-muted)" }}>
        {a.targetPaceSec === null ? "—" : `${formatMinSec(a.targetPaceSec)}`}
      </span>

      <span className="num" style={{ fontSize: "12.5px", fontWeight: 500, textAlign: "end", color: readinessColor(a.readiness) }}>
        {a.readiness ?? "—"}
      </span>
      <span className="num" style={{ fontSize: "12.5px", textAlign: "end", color: formColor(a.form) }}>
        {/* `+ 0` turns -0 back into 0. Without it a form of -0.4 rounds to a
            printed "-0", which looks like a rendering fault in a column where
            the sign carries the meaning. */}
        {a.form === null ? "—" : (Number(a.form.toFixed(0)) + 0).toString()}
      </span>
      <span className="num" style={{ fontSize: "12.5px", textAlign: "end", color: loadColor(a.loadRatio) }}>
        {a.loadRatio === null ? "—" : a.loadRatio.toFixed(2)}
      </span>
      <span className="num" style={{ fontSize: "11px", textAlign: "end", color: "var(--color-muted)" }}>
        {sinceLabel(a.lastRunAt, today)}
      </span>
    </a>
  );
}
