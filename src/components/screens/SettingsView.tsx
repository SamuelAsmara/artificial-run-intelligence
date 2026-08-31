"use client";

/**
 * Settings — a port of design_handoff_ari_athlete_app/ARI Settings.dc.html (v2).
 *
 * The handoff this replaces is kept at _archive/design_handoffs_v1/.
 *
 * Three stacked cards, in this order:
 *
 *   1. **Profile.** Reads as a summary — photo, name, bio and four facts — and
 *      flips to a full editor when asked. The first handoff opened one field at
 *      a time; this one opens the whole card, which is better here because the
 *      fields are interdependent: changing the goal race changes the target
 *      time, which changes the required pace.
 *   2. **Connections.** A row of provider logos acting as tabs over a single
 *      detail panel.
 *   3. **Account & security.** Email and password, expanding in place.
 *
 * ## The one thing this adds to the handoff
 *
 * Selecting Garmin, Suunto or Strava shows the intervals.icu panel, because
 * that is where their data actually arrives from. The handoff does this
 * silently; here the panel names the provider you clicked, so the athlete is
 * told "your Garmin reaches us through intervals.icu" rather than being shown a
 * card for a service they did not select and left to work it out.
 *
 * ## What never reaches this component
 *
 * The intervals.icu API key. `getIntervalsIcuConnection` selects an explicit
 * column list that omits it and returns only the last four characters. This
 * file renders `apiKeyHint` and has no way to ask for more.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { AvatarEditor } from "@/components/settings/AvatarEditor";
import { Avatar } from "@/components/ui/Avatar";
import { AccountSecurity } from "@/components/settings/AccountSecurity";
import { CoachLink } from "@/components/settings/CoachLink";
import { SignOutButton } from "@/components/SignOutButton";
import { LeavePlan } from "@/components/plan/LeavePlan";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/time/week";
import type { MyCoach } from "@/actions/coach";
import { saveAthleteProfile, type AthleteProfileView } from "@/actions/profile";
import {
  connectIntervalsIcu,
  disconnectIntervalsIcu,
  syncIntervalsIcu,
  type ProviderConnectionView,
} from "@/actions/providers";
import { providerById } from "@/lib/providers/registry";
import {
  LEVEL_OPTIONS,
  PROVIDER_TILES,
  RACE_OPTIONS,
  SET_COPY,
  raceLabel,
  reachesUsViaIntervals,
  requiredPace,
} from "@/lib/screens/settings";
import type { RaceType } from "@/types/database.types";
import { Entrance, BrandMark, SectionHeader } from "@/components/ui";
import { METHOD_COPY } from "@/lib/screens/methodology";

const copy = SET_COPY;
const DASH = "—";

/* ------------------------------------------------------------------ */

export function SettingsView({
  icuConnection = null,
  profile = null,
  coach = null,
  plan = null,
}: {
  icuConnection?: ProviderConnectionView | null;
  profile?: AthleteProfileView | null;
  coach?: MyCoach | null;
  /** the active training plan, so it can be left from here as well as from /plan */
  plan?: { title: string; weeks: number } | null;
} = {}) {
  return (
    <div data-entrance-root style={{
      maxWidth: "1080px", marginInline: "auto", padding: "16px 24px 40px",
      display: "flex", flexDirection: "column", gap: "12px",
    }}><Entrance />
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <BrandMark />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>
            {copy.brand}
          </span>
        </div>
        <div style={{ textAlign: "start" }}>
          <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{copy.title}</h1>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.subtitle}</p>
        </div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
          <a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a>
          <a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a>
          <a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a>
          <a href="/numbers" style={{ color: "var(--color-muted)" }}>Numbers</a>
          <a href="/settings" style={{ color: "var(--color-ink)" }}>{copy.navSettings}</a>
        </nav>
        <div style={{ flex: 1 }} />
      </header>

      <ProfileCard profile={profile} />

      {/*
          Everything that is not "who you are" sits behind one row of tabs, so
          the page is a card and a row rather than a scroll. One tab open at a
          time; the open tab closes on a second click, and Escape closes it.
          The hash (#connections, #coach, #account) opens a tab on arrival, so
          "connect your watch" links can land straight on the right one.
      */}
      <SettingsTabs
        tabs={[
          {
            key: "connections", label: "Connections", icon: TAB_ICONS.connections,
            hint: icuConnection ? (icuConnection.status === "connected" ? "Connected" : "Needs attention") : "Not connected",
            panel: <ConnectionsCard connection={icuConnection} />,
          },
          {
            key: "coach", label: "Coach & plan", icon: TAB_ICONS.coach,
            hint: [coach ? coach.name : "No coach", plan ? plan.title : null].filter(Boolean).join(" · "),
            panel: (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <CoachLink coach={coach} />
                {/* the plan sits with the coach: leaving one is how you get to a different one */}
                <section className="card" style={{ padding: "18px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Training plan</h2>
                      <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>
                        {plan ? `${plan.title} · ${plan.weeks} week${plan.weeks === 1 ? "" : "s"}` : "No active plan — the Plan tab offers three ways to start one."}
                      </p>
                    </div>
                    {plan ? null : <a className="btn btn-secondary" href="/plan" style={{ fontSize: "12px" }}>Open Plan</a>}
                  </div>
                  {plan ? <div style={{ marginBlockStart: "10px" }}><LeavePlan /></div> : null}
                </section>
              </div>
            ),
          },
          {
            key: "account", label: "Account & security", icon: TAB_ICONS.account,
            hint: profile?.email ?? "",
            panel: <AccountPanel email={profile?.email ?? null} title={copy.secTitle} sub={copy.secSub} />,
          },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* account & security — the same panel on both settings screens        */
/* ------------------------------------------------------------------ */

export function AccountPanel({ email, title, sub }: { email: string | null; title: string; sub: string }) {
  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{title}</h2>
      <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{sub}</p>
      <AccountSecurity email={email ?? ""} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBlockStart: "20px", paddingBlockStart: "16px", borderBlockStart: "1px solid var(--color-line)" }}>
        <div>
          <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 500 }}>Signed in as {email ?? "\u2014"}</p>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>
            Your data stays where it is; you can sign back in at any time.
          </p>
        </div>
        <SignOutButton />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* the tab row                                                         */
/* ------------------------------------------------------------------ */

export interface SettingsTabDef {
  key: string;
  label: string;
  /** 24×24 stroke path */
  icon: string;
  hint: string;
  panel: React.ReactNode;
}

export const TAB_ICONS = {
  connections: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  coach: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  account: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  coaching: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  numbers: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z M9 7h6M9 11h4",
} as const;

/**
 * Everything that is not "who you are", behind one row of tabs. One open at
 * a time; the open tab closes on a second click and on Escape; the hash
 * (#connections and so on) opens a tab on arrival. Shared by the athlete's
 * and the coach's settings screens, which differ only in which tabs exist.
 */
export function SettingsTabs({ tabs, numbersLink = true }: { tabs: SettingsTabDef[]; numbersLink?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const keys = tabs.map((t) => t.key);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "");
      if (keys.includes(h)) setOpen(h);
    };
    read();
    window.addEventListener("hashchange", read);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", read); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  const pick = (t: string) => {
    const next = open === t ? null : t;
    setOpen(next);
    window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
  };
  const current = tabs.find((t) => t.key === open) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="st-tabs" style={{ gridTemplateColumns: `repeat(${tabs.length + (numbersLink ? 1 : 0)}, minmax(0, 1fr))` }}>
        <div role="tablist" aria-label="Settings sections" style={{ display: "contents" }}>
        {tabs.map((t) => {
          const on = open === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} aria-controls={`st-panel-${t.key}`} className={`card st-tab${on ? " is-open" : ""}`} onClick={() => pick(t.key)}>
              <span className="st-tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="st-tab-label">{t.label}</span>
                <span className="st-tab-hint num">{t.hint}</span>
              </span>
              <svg className="st-tab-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </button>
          );
        })}
        </div>
        {numbersLink ? (
          <a className="card st-tab st-tab-link" href="/numbers">
            <span className="st-tab-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={TAB_ICONS.numbers} /></svg>
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="st-tab-label">{METHOD_COPY.navLink}</span>
              <span className="st-tab-hint num">{METHOD_COPY.navHint}</span>
            </span>
            <svg className="st-tab-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
          </a>
        ) : null}
      </div>
      {current ? (
        <div key={current.key} id={`st-panel-${current.key}`} role="tabpanel" className="st-panel">
          {current.panel}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Profile                                                          */
/* ------------------------------------------------------------------ */

interface Draft {
  fullName: string;
  bio: string;
  age: string;
  heightCm: string;
  weightKg: string;
  runningLevel: string;
  raceType: RaceType | null;
  raceDate: string;
  targetTime: string;
  avatarUrl: string | null;
  avatarPosition: string;
}

const BIO_MAX = 160;

const draftFrom = (p: AthleteProfileView | null): Draft => ({
  fullName: p?.fullName ?? "",
  bio: p?.bio ?? "",
  age: p?.age != null ? String(p.age) : "",
  heightCm: p?.heightCm != null ? String(p.heightCm) : "",
  weightKg: p?.weightKg != null ? String(p.weightKg) : "",
  runningLevel: p?.runningLevel ?? "",
  raceType: p?.raceType ?? null,
  raceDate: p?.raceDate ?? "",
  targetTime: p?.targetTime ?? "",
  avatarUrl: p?.avatarUrl ?? null,
  avatarPosition: p?.avatarPosition ?? "50% 30%",
});

/*
 * Exported so the coach's settings page can render the same card.
 * A coach has a profile, a photo and a name like anybody else; the alternative
 * was a second, slightly different profile editor, which is how two screens
 * come to disagree about what your name is.
 */
export function ProfileCard({ profile }: { profile: AthleteProfileView | null }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(profile));
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const startEdit = () => {
    setDraft(draftFrom(profile));
    setError("");
    setSaved(false);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError("");
  };

  const save = () => {
    setError("");
    startTransition(async () => {
      const result = await saveAthleteProfile({
        fullName: draft.fullName,
        bio: draft.bio,
        age: draft.age,
        // Not in this handoff's form; preserved so saving does not clear it.
        sex: profile?.sex ?? "",
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        runningLevel: draft.runningLevel,
        avatarUrl: draft.avatarUrl,
        avatarPosition: draft.avatarPosition,
        raceType: draft.raceType ?? "",
        raceDate: draft.raceDate,
        targetTime: draft.targetTime,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setSaved(true);
    });
  };

  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      {editing
        ? <ProfileEditor
            draft={draft} set={set} save={save} cancel={cancel}
            pending={pending} error={error}
          />
        : <ProfileSummary profile={profile} saved={saved} onEdit={startEdit} />}
    </section>
  );
}

function ProfileSummary({
  profile, saved, onEdit,
}: {
  profile: AthleteProfileView | null;
  saved: boolean;
  onEdit: () => void;
}) {
  const facts = [
    { label: copy.fLevel, value: titleCase(profile?.runningLevel) },
    { label: copy.fGoalRace, value: raceLabel(profile?.raceType ?? null) },
    { label: copy.fTarget, value: profile?.targetTime ?? DASH, mono: true },
  ];
  const pace = requiredPace(profile?.raceType ?? null, profile?.targetTime ?? null);

  return (
    <>
      <div className="profile-view" style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <Avatar
          src={profile?.avatarUrl ?? null}
          name={profile?.fullName || profile?.email}
          size={76}
          zoomable
        />

        <div style={{ flex: 1, minWidth: "220px" }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>
            {profile?.fullName || profile?.email || DASH}
          </h2>
          <p style={{
            margin: "3px 0 0", fontSize: "12.5px", color: "var(--color-muted)",
            maxWidth: "520px", textWrap: "pretty",
          }}>
            {profile?.bio || copy.noBio}
          </p>
        </div>

        <div className="fact-row">
          {facts.map((f) => (
            <div key={f.label}>
              <span className="lbl" style={{ marginBlockEnd: "2px" }}>{f.label}</span>
              <p className={f.mono ? "num" : undefined} style={{ margin: 0, fontSize: "13.5px", fontWeight: 500 }}>
                {f.value}
              </p>
            </div>
          ))}
          <div>
            <span className="lbl" style={{ marginBlockEnd: "2px" }}>{copy.fPace}</span>
            <p className="num" style={{
              margin: 0, fontSize: "13.5px", fontWeight: 500, color: "var(--color-accent)",
            }}>
              {pace}
            </p>
          </div>
        </div>

        <button className="btn btn-secondary" type="button" onClick={onEdit} style={{ alignSelf: "flex-start" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          </svg>
          {copy.edit}
        </button>
      </div>

      {saved ? (
        <p className="num" style={{ margin: "10px 0 0", fontSize: "11px", color: "var(--color-positive)" }}>
          {copy.savedMsg}
        </p>
      ) : null}
    </>
  );
}

function ProfileEditor({
  draft, set, save, cancel, pending, error,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  save: () => void;
  cancel: () => void;
  pending: boolean;
  error: string;
}) {
  const pace = requiredPace(draft.raceType, draft.targetTime);

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{copy.profileTitle}</h2>
        <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.profileSub}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBlockStart: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <AvatarEditor
            src={draft.avatarUrl}
            onChange={(next) => {
              set("avatarUrl", next.src);
              set("avatarPosition", next.position);
            }}
          />
          <div>
            <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 500 }}>{copy.fPhoto}</p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>
              {copy.fPhotoSub}
            </p>
          </div>
        </div>

        <div className="set-grid">
          <div>
            <label htmlFor="f-name" className="lbl">{copy.fName}</label>
            <input id="f-name" className="field" value={draft.fullName}
              onChange={(e) => set("fullName", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label htmlFor="f-age" className="lbl">{copy.fAge}</label>
              <input id="f-age" className="field num" type="number" value={draft.age}
                onChange={(e) => set("age", e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-height" className="lbl">{copy.fHeight}</label>
              <input id="f-height" className="field num" type="number" value={draft.heightCm}
                onChange={(e) => set("heightCm", e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-weight" className="lbl">{copy.fWeight}</label>
              <input id="f-weight" className="field num" type="number" value={draft.weightKg}
                onChange={(e) => set("weightKg", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="f-bio" className="lbl">{copy.fBio}</label>
          <textarea id="f-bio" className="field" rows={2}
            style={{ resize: "vertical", minHeight: "52px", fontFamily: "var(--font-sans)" }}
            value={draft.bio}
            onChange={(e) => set("bio", e.target.value.slice(0, BIO_MAX))}
            placeholder={copy.fBioPh} />
          <p className="num" style={{
            margin: "4px 0 0", fontSize: "10px", color: "var(--color-faint)", textAlign: "end",
          }}>
            {draft.bio.length} / {BIO_MAX}
          </p>
        </div>

        <div className="set-grid">
          <div>
            <span className="lbl">{copy.fLevel}</span>
            <Segmented
              options={LEVEL_OPTIONS.map((l) => ({ key: l.value, label: l.label }))}
              selected={draft.runningLevel}
              onPick={(key) => set("runningLevel", key)}
            />
          </div>
          <div>
            <span className="lbl">{copy.fGoalRace}</span>
            <Segmented
              options={RACE_OPTIONS.map((r) => ({ key: r.value, label: r.label }))}
              selected={draft.raceType ?? ""}
              onPick={(key) => {
                const previous = draft.raceType;
                set("raceType", key as RaceType);
                /*
                 * Changing distance clears the target time.
                 *
                 * The guard here used to be `if (option && !draft.targetTime)`,
                 * which does the opposite of what the comment beside it said:
                 * an existing time was *kept*. An athlete with a 22:00 five-km
                 * target who switched to Marathon was shown a required pace of
                 * 0:31 /km, and could save 22:00 as a marathon goal.
                 *
                 * Nor is a default offered any more. The previous behaviour
                 * wrote 3:45:00 into the field the moment "Marathon" was
                 * tapped, and pressing Save stored it — so a number nobody
                 * chose became the athlete's goal and drove their plan.
                 */
                if (previous && previous !== key) set("targetTime", "");
              }}
            />
          </div>
        </div>

        <div className="set-grid">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label htmlFor="f-target" className="lbl">{copy.fTarget}</label>
              <input id="f-target" className="field num" value={draft.targetTime}
                onChange={(e) => set("targetTime", e.target.value)} placeholder="3:45:00" />
            </div>
            <div>
              <label htmlFor="f-racedate" className="lbl">{copy.fRaceDate}</label>
              <input id="f-racedate" className="field num" type="date" value={draft.raceDate}
                onChange={(e) => set("raceDate", e.target.value)} />
            </div>
          </div>
          <div>
            <span className="lbl">{copy.fPace}</span>
            <p className="num" style={{
              margin: 0, padding: "9px 12px", border: "1px solid var(--color-line)",
              borderRadius: "var(--radius-control)", fontSize: "13px", color: "var(--color-accent)",
            }}>
              {pace}
            </p>
          </div>
        </div>

        {error ? (
          <p className="num" style={{ margin: 0, fontSize: "11px", color: "var(--color-negative)" }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "10px", marginBlockStart: "2px" }}>
          <button className="btn btn-primary" type="button" onClick={save} disabled={pending}>
            {pending ? copy.saving : copy.save}
          </button>
          <button className="btn btn-secondary" type="button" onClick={cancel} disabled={pending}>
            {copy.cancel}
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Connections                                                      */
/* ------------------------------------------------------------------ */

export function ConnectionsCard({ connection }: { connection: ProviderConnectionView | null }) {
  const [selected, setSelected] = useState("intervals_icu");

  /*
   * A dot means "your data reaches us from here", and only intervals.icu can
   * earn one.
   *
   * Garmin, Suunto and Strava used to inherit it on the theory that if the
   * aggregator is live so are they. Nothing checks that. `getIntervalsIcuConnection`
   * returns no information about what feeds intervals.icu, so an athlete who
   * uploads files by hand was shown three green dots claiming connections they
   * do not have. Those tiles still open the intervals.icu panel — which is the
   * truthful answer to "is my Garmin connected?" — they simply no longer assert
   * it on the tile itself.
   */
  const icuLive = connection?.status === "connected";
  const connected = useMemo(
    () => new Set(icuLive ? ["intervals_icu"] : []),
    [icuLive],
  );

  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <SectionHeader title={copy.connTitle} />
      <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.connSub}</p>

      <div className="conn-row" style={{ marginBlockStart: "12px" }}>
        {PROVIDER_TILES.map((tile) => {
          const isSelected = selected === tile.id;
          const isConnected = connected.has(tile.id);
          const lit = isSelected || isConnected;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => setSelected(tile.id)}
              aria-pressed={isSelected}
              style={{
                flex: 1, minWidth: "88px", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end", gap: "8px",
                padding: "10px 8px 8px", cursor: "pointer", border: "none",
                fontFamily: "inherit",
                // A tile, not a tab: the selection is an inset ring plus a soft
                // ground, so picking a provider cannot shift the row it sits in.
                borderRadius: "var(--radius-control)",
                background: isSelected ? "var(--color-accent-soft)" : "transparent",
                boxShadow: isSelected
                  ? "inset 0 0 0 1px var(--color-accent)"
                  : "inset 0 0 0 1px var(--color-line)",
                transition: "background 0.15s, box-shadow 0.15s",
              }}
            >
              <span style={{
                width: "64px", height: "36px", borderRadius: "9px", background: tile.chipBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: lit ? 1 : 0.55,
              }}>
                <TileMark tile={tile} />
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "10.5px",
                letterSpacing: ".02em", whiteSpace: "nowrap",
                color: lit ? "var(--color-ink)" : "var(--color-muted)",
              }}>
                {tile.name}
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: isConnected ? "var(--color-positive)" : "var(--color-line-strong)",
                }} />
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginBlockStart: "10px" }}>
        {reachesUsViaIntervals(selected)
          ? <IntervalsPanel connection={connection} selected={selected} />
          : <PlannedPanel selected={selected} />}
      </div>
    </section>
  );
}

/**
 * The provider mark.
 *
 * Brand logos are loaded from their own sources, which means an ad blocker or
 * an offline demo can leave the chip blank. Falling back to the letter keeps
 * the row legible in the one situation where you cannot fix it — a live demo.
 */
export function TileMark({ tile }: { tile: (typeof PROVIDER_TILES)[number] }) {
  const [failed, setFailed] = useState(false);

  if (!tile.logo || failed) {
    return (
      <span className="num" style={{
        fontStyle: "italic", fontWeight: 500, fontSize: "18px",
        color: tile.markColor, lineHeight: 1,
      }}>
        {tile.mark}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote brand marks, no loader
    <img
      src={tile.logo}
      alt={tile.name}
      onError={() => setFailed(true)}
      style={{ height: `${tile.logoHeight}px`, width: "auto", maxWidth: "48px", display: "block" }}
    />
  );
}

function IntervalsPanel({
  connection, selected,
}: {
  connection: ProviderConnectionView | null;
  selected: string;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const live = connection?.status === "connected";

  const sync = () => {
    setNote("");
    startTransition(async () => {
      const result = await syncIntervalsIcu();
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      // The count that was missing: how many runs still have no per-second
      // detail. Without it the button says "Synced" and the charts stay empty,
      // which reads as a broken app rather than an unfinished backfill.
      const { runs, nights, detailed, remaining } = result.data;
      const parts = [`Synced ${runs} runs and ${nights} nights`];
      if (detailed > 0) parts.push(`${detailed} runs analysed`);
      setNote(
        remaining > 0
          ? `${parts.join(" · ")} — ${remaining} still to analyse. Press Sync again to continue.`
          : `${parts.join(" · ")}.`,
      );
    });
  };

  const disconnect = () => {
    setNote("");
    startTransition(async () => {
      const result = await disconnectIntervalsIcu();
      if (!result.ok) setNote(result.error);
    });
  };

  // Named so the redirection is stated. Clicking Garmin and being shown an
  // intervals.icu card is correct, but only once someone says why.
  const via = selected !== "intervals_icu" ? providerById(selected)?.name : null;

  const facts: { label: string; value: string; tone?: string }[] = [
    { label: copy.icuAccount, value: connection?.externalId ?? DASH },
    { label: copy.icuKey, value: connection?.apiKeyHint ? `••••${connection.apiKeyHint}` : DASH },
    { label: copy.icuChecked, value: dateTime(connection?.lastSyncedAt) },
    { label: copy.icuRecent, value: dateOnly(connection?.lastActivityAt) },
  ];

  return (
    <div style={{
      border: `1px solid ${live ? "var(--color-positive)" : "var(--color-line)"}`,
      borderRadius: "var(--radius-control)",
      background: "var(--color-elevated)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>{copy.icuName}</p>
          <p style={{ margin: "1px 0 0", fontSize: "10.5px", color: "var(--color-muted)" }}>
            {via ? `${via} reaches Runi through intervals.icu` : copy.icuDesc}
          </p>
        </div>
        <span className="tag" style={{
          background: "var(--color-surface)",
          color: live ? "var(--color-positive)" : "var(--color-faint)",
        }}>
          {live ? copy.connected : copy.notConnected}
        </span>
      </div>

      {connection ? (
        <>
          <div className="icu-grid" style={{
            borderBlockStart: "1px solid var(--color-line)", padding: "12px 14px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px",
          }}>
            {facts.map((f) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{f.label}</span>
                <span className="num" style={{ fontSize: "12px" }}>{f.value}</span>
              </div>
            ))}
          </div>

          {/*
            The last error the sync recorded.

            `lastError` has been on the connection object all along and was
            rendered nowhere. A regenerated API key put "error" in the database
            and left this panel looking healthy, with the one sentence that
            explains it sitting unread in a column.
          */}
          {connection.lastError ? (
            <p style={{
              margin: 0, padding: "0 14px 12px", fontSize: "11.5px",
              color: connection.status === "error" ? "var(--color-negative)" : "var(--color-caution)",
              lineHeight: 1.6,
            }}>
              {connection.lastError}
            </p>
          ) : null}

          <div style={{
            borderBlockStart: "1px solid var(--color-line)", padding: "10px 14px",
            display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap",
          }}>
            <button className="btn btn-secondary" type="button" onClick={sync} disabled={pending}
              style={{ padding: "7px 13px", fontSize: "12px" }}>
              {pending ? copy.syncing : copy.syncNow}
            </button>
            <button className="btn" type="button" onClick={disconnect} disabled={pending}
              style={{
                padding: "7px 13px", fontSize: "12px", color: "var(--color-negative)",
                borderColor: "transparent", background: "transparent",
              }}>
              {copy.disconnect}
            </button>
            {note ? (
              <span className="num" style={{ fontSize: "11px", color: "var(--color-muted)" }}>{note}</span>
            ) : null}
          </div>
        </>
      ) : (
        <ConnectForm />
      )}
    </div>
  );
}

/**
 * The connection form — one field.
 *
 * intervals.icu has no OAuth for personal accounts, so the athlete still has
 * to generate a key on their settings page. Everything around that step is
 * ours to smooth: the settings page opens in a small window beside Runi
 * instead of a tab that hides it; the three steps are written down; and the
 * athlete pastes one thing — the key. The server asks intervals.icu whose key
 * it is (`athlete/0`), so the athlete id is never typed, and the reply greets
 * them by name with what was found. A pasted blob that also contains the id
 * (people copy both lines) is split apart quietly.
 *
 * The key is posted to a server action, verified against intervals.icu
 * before it is stored, and never comes back to this component.
 */
function ConnectForm() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** People paste "i123456  a1b2c3…" or the whole settings row. Keep the key. */
  const splitPaste = (raw: string): { athleteId: string; apiKey: string } => {
    const tokens = raw.trim().split(/[\s,;:]+/).filter(Boolean);
    if (tokens.length <= 1) return { athleteId: "", apiKey: raw.trim() };
    const id = tokens.find((t) => /^i\d{3,}$/i.test(t)) ?? "";
    const key = tokens.filter((t) => t !== id).sort((a, b) => b.length - a.length)[0] ?? "";
    return { athleteId: id, apiKey: key };
  };

  const openSettings = () => {
    const w = 980, h = 780;
    const left = Math.max(0, window.screenX + window.outerWidth - w - 24);
    const top = Math.max(0, window.screenY + 60);
    const win = window.open(
      "https://intervals.icu/settings",
      "runi-intervals",
      `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener`,
    );
    if (!win) window.open("https://intervals.icu/settings", "_blank", "noopener");
  };

  const submit = () => {
    setError("");
    const { athleteId, apiKey: key } = splitPaste(apiKey);
    startTransition(async () => {
      const result = await connectIntervalsIcu(athleteId, key);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const who = result.data.name ? `Connected as ${result.data.name}` : "Connected";
      const found: string[] = [];
      if (result.data.runsImported > 0) found.push(`${result.data.runsImported} runs`);
      if (result.data.nightsImported > 0) found.push(`${result.data.nightsImported} nights`);
      setDone(found.length ? `${who} · ${found.join(" and ")} found` : `${who} · nothing to import yet`);
      setApiKey("");
    });
  };

  /*
   * Written against the real page (checked 2026-08-31): Developer Settings
   * is a plain heading two-thirds of the way down, in the right-hand column
   * past Notifications, with no anchor to link to. The key is hidden behind
   * "(view)"; the pencil next to it regenerates the key and kills the old
   * one, so the steps say which of the two to press.
   */
  const STEPS = [
    "Open your intervals.icu settings — it opens beside Runi, so keep this page in view.",
    "Scroll down to Developer Settings (right column, past Notifications). Click (view) next to API Key — not the pencil, that makes a new key.",
    "Copy the key and paste it here. That's the only thing we need.",
  ];

  return (
    <div style={{
      borderBlockStart: "1px solid var(--color-line)", padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: "12px",
    }}>
      <ol style={{ margin: 0, paddingInlineStart: "0", listStyle: "none", display: "grid", gap: "6px" }}>
        {STEPS.map((t, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "8px", alignItems: "baseline", fontSize: "12px", color: "var(--color-muted)" }}>
            <span className="num" style={{ fontSize: "11px", color: "var(--color-accent)" }}>{i + 1}</span>
            <span style={{ textWrap: "pretty" }}>{t}</span>
          </li>
        ))}
      </ol>

      {/* what to look for — a sketch of the block on their page */}
      <div aria-hidden style={{
        alignSelf: "start", padding: "10px 14px", borderRadius: "8px",
        background: "#1f2530", boxShadow: "inset 0 0 0 1px #2f3745",
        display: "grid", gap: "6px", fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#7fb2ff", fontSize: "12px", fontWeight: 600 }}>
          <span className="num" style={{ fontSize: "11px" }}>&lt;&gt;</span> Developer Settings
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: "22px", rowGap: "2px", fontSize: "11px" }}>
          <span style={{ color: "#9aa4b5" }}>Athlete ID</span>
          <span style={{ color: "#9aa4b5" }}>API Key</span>
          <span className="num" style={{ color: "#e9edf3" }}>i123456</span>
          <span style={{ color: "#e9edf3", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ padding: "1px 6px", borderRadius: "4px", boxShadow: "0 0 0 1.5px var(--color-accent)", color: "var(--color-accent)", fontWeight: 600 }}>(view)</span>
            <span style={{ color: "#6b7688", fontSize: "10px" }}>✎ ← makes a new key</span>
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-secondary" type="button" onClick={openSettings} style={{ padding: "7px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "7px" }}>
          Open intervals.icu settings
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
          </svg>
        </button>
      </div>

      <div>
        <label htmlFor="icu-key" className="lbl">API key</label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input id="icu-key" className="field num" type="password" value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setDone(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && apiKey.trim().length >= 8 && !pending) submit(); }}
            placeholder="paste the key" autoComplete="off" spellCheck={false} style={{ flex: 1 }} />
          <button className="btn btn-primary" type="button" onClick={submit}
            disabled={pending || apiKey.trim().length < 8}
            style={{ padding: "7px 14px", fontSize: "12px", whiteSpace: "nowrap" }}>
            {pending ? "Checking…" : "Connect"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="num" style={{ margin: 0, fontSize: "11px", color: "var(--color-negative)" }}>{error}</p>
      ) : null}
      {done ? (
        <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-positive)" }}>{done}</p>
      ) : null}

      <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)", textWrap: "pretty" }}>
        The key is stored for your account only, used from our server, and never sent to your browser again. You can revoke it on intervals.icu at any time.
      </p>
    </div>
  );
}

function PlannedPanel({ selected }: { selected: string }) {
  const provider = providerById(selected);
  if (!provider) return null;

  return (
    <div style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-control)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>{provider.name}</p>
          <p style={{ margin: "1px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>
            {provider.summary}
          </p>
        </div>
        <span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-faint)" }}>
          {copy.comingSoon}
        </span>
      </div>
      {provider.blockedReason ? (
        <div style={{
          borderBlockStart: "1px solid var(--color-line)", padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: "8px",
        }}>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)", textWrap: "pretty" }}>
            {provider.blockedReason}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function Segmented({
  options, selected, onPick,
}: {
  options: { key: string; label: string }[];
  selected: string;
  onPick: (key: string) => void;
}) {
  return (
    <div style={{
      display: "flex", border: "1px solid var(--color-line-strong)",
      borderRadius: "var(--radius-control)", overflow: "hidden",
    }}>
      {options.map((o) => {
        const on = selected === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onPick(o.key)}
            aria-pressed={on}
            style={{
              flex: 1, font: "500 12px var(--font-sans)", padding: "9px 0", border: "none",
              cursor: "pointer",
              background: on ? "var(--color-accent)" : "transparent",
              color: on ? "var(--color-accent-ink)" : "var(--color-muted)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const titleCase = (s: string | null | undefined) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : DASH;

/*
 * Formatted in a fixed timezone and locale.
 *
 * This is a client component, so it is server-rendered first: bare
 * `toLocaleDateString()` used the server's locale and UTC during SSR and the
 * browser's on hydration, which is a React hydration mismatch and a visible
 * flip — plus an off-by-one day for anything synced late in the evening.
 * Pinning both makes the two renders identical.
 */
const dateOnly = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat(APP_LOCALE, {
        day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TIME_ZONE,
      }).format(new Date(iso))
    : DASH;

const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat(APP_LOCALE, {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TIME_ZONE,
      }).format(new Date(iso))
    : copy.never;
