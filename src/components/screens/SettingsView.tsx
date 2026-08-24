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

import { useMemo, useState, useTransition } from "react";
import { AvatarEditor } from "@/components/settings/AvatarEditor";
import { Avatar } from "@/components/ui/Avatar";
import { AccountSecurity } from "@/components/settings/AccountSecurity";
import { CoachLink } from "@/components/settings/CoachLink";
import { SignOutButton } from "@/components/SignOutButton";
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
import { SectionHeader } from "@/components/ui";
import { METHOD_COPY } from "@/lib/screens/methodology";

const copy = SET_COPY;
const DASH = "—";

/* ------------------------------------------------------------------ */

export function SettingsView({
  icuConnection = null,
  profile = null,
  coach = null,
}: {
  icuConnection?: ProviderConnectionView | null;
  profile?: AthleteProfileView | null;
  coach?: MyCoach | null;
} = {}) {
  return (
    <div style={{
      maxWidth: "1080px", marginInline: "auto", padding: "16px 24px 40px",
      display: "flex", flexDirection: "column", gap: "12px",
    }}>
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{
            width: "10px", height: "10px", background: "var(--color-accent)",
            borderRadius: "2px", display: "inline-block",
          }} />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>
            {copy.brand}
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{copy.title}</h1><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
          <a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a>
          <a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a>
          <a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a>
          <a href="/settings" style={{ color: "var(--color-ink)" }}>{copy.navSettings}</a>
        </nav>
        <div style={{ flex: 1 }} />
      </header>

      <ProfileCard profile={profile} />
      <ConnectionsCard connection={icuConnection} />
      <CoachLink coach={coach} />

      {/*
          The methodology page.
          A row rather than a section, because it is a door, not a setting.
      */}
      <a
        className="card dc-hover-border"
        href="/settings/methodology"
        style={{
          display: "flex", alignItems: "center", gap: "14px",
          padding: "16px 22px", textDecoration: "none", color: "inherit",
        }}
      >
        <span style={{
          width: "34px", height: "34px", borderRadius: "50%", flexShrink: 0,
          background: "var(--color-elevated)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            <path d="M9 7h6M9 11h4" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{METHOD_COPY.navLink}</p>
          <p className="num" style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>
            {METHOD_COPY.navHint}
          </p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </a>

      <section className="card" style={{ padding: "20px 24px" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{copy.secTitle}</h2>
        <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.secSub}</p>
        <AccountSecurity email={profile?.email ?? ""} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBlockStart: "20px", paddingBlockStart: "16px", borderBlockStart: "1px solid var(--color-line)" }}>
          <div>
            <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 500 }}>Signed in as {profile?.email ?? "\u2014"}</p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>
              Your data stays where it is; you can sign back in at any time.
            </p>
          </div>
          <SignOutButton />
        </div>
      </section>
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
function TileMark({ tile }: { tile: (typeof PROVIDER_TILES)[number] }) {
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
            {via ? `${via} reaches ARI through intervals.icu` : copy.icuDesc}
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
 * Connecting for the first time, or again after a disconnect.
 *
 * intervals.icu has no OAuth flow for personal accounts, so the athlete copies
 * two values out of their own settings page. The key is posted to a server
 * action and verified against intervals.icu before it is stored, so a typo
 * surfaces here rather than as a stale readiness score a week later — and it
 * never comes back to this component afterwards.
 */
function ConnectForm() {
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError("");
    startTransition(async () => {
      const result = await connectIntervalsIcu(athleteId, apiKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAthleteId("");
      setApiKey("");
    });
  };

  return (
    <div style={{
      borderBlockStart: "1px solid var(--color-line)", padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: "10px",
    }}>
      <div className="set-grid">
        <div>
          <label htmlFor="icu-athlete" className="lbl">Athlete ID</label>
          <input id="icu-athlete" className="field num" value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)} placeholder="i123456" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="icu-key" className="lbl">API key</label>
          <input id="icu-key" className="field num" type="password" value={apiKey}
            onChange={(e) => setApiKey(e.target.value)} placeholder="paste the whole key"
            autoComplete="off" />
        </div>
      </div>
      <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)", textWrap: "pretty" }}>
        Both are on your{" "}
        <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer"
          style={{ color: "var(--color-accent)" }}>
          intervals.icu settings page
        </a>
        , under Developer. The key is stored for your account only and is never sent to your browser
        again.
      </p>
      {error ? (
        <p className="num" style={{ margin: 0, fontSize: "11px", color: "var(--color-negative)" }}>
          {error}
        </p>
      ) : null}
      <div>
        <button className="btn btn-primary" type="button" onClick={submit}
          disabled={pending || !athleteId.trim() || apiKey.trim().length < 8}
          style={{ padding: "7px 14px", fontSize: "12px" }}>
          {pending ? "Checking…" : "Connect"}
        </button>
      </div>
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
