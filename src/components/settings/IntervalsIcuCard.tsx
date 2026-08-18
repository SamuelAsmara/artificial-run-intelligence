"use client";

/**
 * The intervals.icu connection card, first in Settings → Connectivity.
 *
 * ## Why it sits above Strava
 *
 * Strava gives us distance, duration and heart rate. intervals.icu is the only
 * source we have for sleep, heart-rate variability and resting heart rate —
 * the overnight half of the readiness score. Without it the score falls back to
 * training load alone and says so. It is therefore the single most valuable
 * thing an athlete can connect, so it goes at the top.
 *
 * ## Why the athlete pastes a key instead of clicking "Connect"
 *
 * intervals.icu issues personal API keys rather than running an OAuth server,
 * so there is no redirect flow to hand off to. The card's job is to make that
 * copy-and-paste as short and as forgiving as possible: it accepts the athlete
 * id with or without the leading `i`, and accepts a pasted profile URL.
 *
 * The key is sent once, to our own server action, which verifies it against
 * intervals.icu before storing it. It is never read back into this component —
 * only the last four characters are, so the athlete can confirm which key is
 * connected.
 */

import { useState, useTransition } from "react";
import {
  connectIntervalsIcu,
  disconnectIntervalsIcu,
  syncIntervalsIcu,
  type ProviderConnectionView,
} from "@/actions/providers";

const COPY = {
  name: "intervals.icu",
  why: "Sleep, heart-rate variability and resting heart rate",
  whyLong:
    "The only source we have for overnight recovery. Without it your readiness " +
    "score is built from training load alone.",
  recommended: "Recommended",
  connect: "Connect",
  connecting: "Checking…",
  connected: "Connected",
  disconnect: "Disconnect",
  syncNow: "Sync now",
  syncing: "Syncing…",
  fAthlete: "Athlete ID",
  fKey: "API key",
  athletePh: "i123456",
  keyPh: "paste your key",
  help: "Find both on intervals.icu → Settings → Developer.",
  helpLink: "https://intervals.icu/settings",
  account: "Account",
  keyLabel: "API key",
  lastSync: "Last sync",
  never: "never",
  cancel: "Cancel",
  useMine: "Use my own",
  envNoteLong:
    "This is the key configured on the server, not one you connected. Attach your own " +
    "account to make the readiness score yours.",
} as const;

const ACCENT = "var(--color-accent)";

export function IntervalsIcuCard({
  connection,
}: {
  connection: ProviderConnectionView | null;
}) {
  const [open, setOpen] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(connection?.lastError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A connection that came from the server environment is *the developer's*,
  // not this athlete's. Show it, so the state is honest, but keep offering to
  // connect their own — otherwise anyone using a self-hosted instance that has
  // a key in .env can never attach their own account.
  const fromEnv = connection?.fromEnvironment === true;
  const isConnected = !!connection && connection.status !== "revoked";
  const hasError = !!connection && connection.status === "error";

  const border = hasError
    ? "var(--color-negative)"
    : isConnected
      ? "var(--color-positive)"
      : ACCENT;

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await connectIntervalsIcu(athleteId, apiKey);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setApiKey("");
      setAthleteId("");
      setOpen(false);
      const who = res.data.name ? ` as ${res.data.name}` : "";
      const bits = [
        res.data.runsImported > 0 ? `${res.data.runsImported} runs` : null,
        res.data.nightsImported > 0 ? `${res.data.nightsImported} nights` : null,
      ].filter(Boolean);
      setNotice(
        bits.length
          ? `Connected${who} — imported ${bits.join(" and ")}.`
          : `Connected${who}.`,
      );
      if (res.data.warning) setError(res.data.warning);
    });
  }

  function disconnect() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await disconnectIntervalsIcu();
      if (!res.ok) setError(res.error);
    });
  }

  function sync() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await syncIntervalsIcu();
      if (res.ok) {
        const bits = [
          res.data.runs > 0 ? `${res.data.runs} runs` : null,
          res.data.nights > 0 ? `${res.data.nights} nights` : null,
          res.data.detailed > 0 ? `${res.data.detailed} with full detail` : null,
        ].filter(Boolean);
        // Stream detail is fetched one activity at a time, so a first backfill
        // takes several syncs. Say how many are left rather than looking stuck.
        const more =
          res.data.remaining > 0
            ? ` ${res.data.remaining} still to process — sync again to continue.`
            : "";
        setNotice(
          (bits.length ? `Synced ${bits.join(", ")}.` : "Nothing new to sync.") + more,
        );
        if (res.data.warning) setError(res.data.warning);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${border}`,
        borderRadius: "var(--radius-control)",
        background: "var(--color-elevated)",
      }}
    >
      {/* header row — mirrors the Strava row below it */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px" }}>
        <span
          className="num"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "8px",
            background: ACCENT,
            color: "var(--color-accent-ink)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            fontWeight: 500,
          }}
          aria-hidden="true"
        >
          i
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>{COPY.name}</p>
            {!isConnected && (
              <span
                className="tag"
                style={{ background: "var(--color-accent-soft)", color: ACCENT }}
              >
                {COPY.recommended}
              </span>
            )}
          </div>
          <p
            className="num"
            style={{
              margin: "1px 0 0",
              fontSize: "10.5px",
              color: hasError ? "var(--color-negative)" : "var(--color-muted)",
            }}
          >
            {hasError ? (connection?.lastError ?? "Sync failed") : COPY.why}
          </p>
        </div>

        {isConnected && !fromEnv ? (
          <span className="tag" style={{ background: "var(--color-surface)", color: "var(--color-positive)" }}>
            {COPY.connected}
          </span>
        ) : pending ? (
          <span className="num" style={{ fontSize: "11px", color: "var(--color-muted)" }}>
            {COPY.connecting}
          </span>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{ padding: "7px 14px" }}
          >
            {open ? COPY.cancel : COPY.connect}
          </button>
        )}
      </div>

      {/* the paste form */}
      {(!isConnected || fromEnv) && open && (
        <div
          style={{
            borderBlockStart: "1px solid var(--color-line)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)", textWrap: "pretty" }}>
            {COPY.whyLong}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "10px" }}>
            <div>
              <label
                htmlFor="icu-athlete"
                style={{
                  display: "block",
                  fontSize: "11px",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--color-muted)",
                  marginBlockEnd: "6px",
                }}
              >
                {COPY.fAthlete}
              </label>
              <input
                className="field num"
                id="icu-athlete"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                placeholder={COPY.athletePh}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label
                htmlFor="icu-key"
                style={{
                  display: "block",
                  fontSize: "11px",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--color-muted)",
                  marginBlockEnd: "6px",
                }}
              >
                {COPY.fKey}
              </label>
              <input
                className="field num"
                id="icu-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={COPY.keyPh}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {error && (
            <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-negative)" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={submit}
              disabled={pending}
              style={{ padding: "7px 14px" }}
            >
              {pending ? COPY.connecting : COPY.connect}
            </button>
            <a
              href={COPY.helpLink}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "11px", color: "var(--color-muted)" }}
            >
              {COPY.help}
            </a>
          </div>
        </div>
      )}

      {/* connected detail — same three-row layout the Strava card uses */}
      {isConnected && connection && (
        <div
          style={{
            borderBlockStart: "1px solid var(--color-line)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <Row label={COPY.account} value={connection.externalId} />
          <Row
            label={COPY.keyLabel}
            value={connection.apiKeyHint ? `••••${connection.apiKeyHint}` : "••••"}
          />
          <Row
            label={COPY.lastSync}
            value={
              connection.lastSyncedAt
                ? new Date(connection.lastSyncedAt).toLocaleString()
                : COPY.never
            }
            tone={connection.lastSyncedAt ? undefined : "var(--color-faint)"}
          />

          {fromEnv && (
            <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-caution)", textWrap: "pretty" }}>
              {COPY.envNoteLong}
            </p>
          )}
          {notice && (
            <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-positive)" }}>
              {notice}
            </p>
          )}
          {error && (
            <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-negative)" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: "8px", marginBlockStart: "2px" }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={sync}
              disabled={pending}
              style={{ padding: "7px 13px", fontSize: "12px" }}
            >
              {pending ? COPY.syncing : COPY.syncNow}
            </button>
            {fromEnv ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{ padding: "7px 13px", fontSize: "12px" }}
              >
                {open ? COPY.cancel : COPY.useMine}
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={disconnect}
                disabled={pending}
                style={{ padding: "7px 13px", fontSize: "12px", color: "var(--color-negative)" }}
              >
                {COPY.disconnect}
              </button>
            )}
          </div>
        </div>
      )}

      {/* success message when the card is collapsed */}
      {!isConnected && !open && notice && (
        <p
          className="num"
          style={{
            margin: 0,
            padding: "0 14px 12px",
            fontSize: "11.5px",
            color: "var(--color-positive)",
          }}
        >
          {notice}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
      <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{label}</span>
      <span
        className="num"
        style={{ fontSize: "12px", color: tone ?? "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {value}
      </span>
    </div>
  );
}
