"use client";

/**
 * The athlete's side of the coaching relationship, on their Settings page.
 *
 * Two states and nothing in between: you have a coach, or you have a field to
 * enter their code. Leaving is one button with no confirmation — an athlete
 * must never need permission, or a conversation, to stop being coached.
 */

import { useState, useTransition } from "react";
import { joinCoach, leaveCoach, type MyCoach } from "@/actions/coach";

const COPY = {
  title: "Coach",
  subHas: "They can see how you train, and change your plan.",
  subNone: "Have a coach code? Enter it here.",
  privacy:
    "Your coach sees your runs, your readiness and your plan. They never see how your account is connected or any key you have entered.",
  field: "Coach code",
  placeholder: "ABC123",
  join: "Join",
  joining: "Joining…",
  leave: "Leave",
  leaving: "Leaving…",
  since: "Coached since",
} as const;

export function CoachLink({ coach }: { coach: MyCoach | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const join = () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError("That code looks too short.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await joinCoach(trimmed);
      if (result.ok) setCode("");
      else setError(result.error);
    });
  };

  const leave = () => {
    setError("");
    startTransition(async () => {
      const result = await leaveCoach();
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <section className="card" style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>{COPY.title}</h2>
        <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
          {coach ? COPY.subHas : COPY.subNone}
        </span>
      </div>

      {coach ? (
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginBlockStart: "12px" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "13.5px", fontWeight: 500 }}>{coach.name}</p>
            <p className="num" style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>
              {COPY.since} {coach.since.slice(0, 10)}
            </p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={leave} disabled={pending}>
            {pending ? COPY.leaving : COPY.leave}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap", marginBlockStart: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 180px" }}>
            <span className="lbl">{COPY.field}</span>
            <input
              className="afield"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") join();
              }}
              placeholder={COPY.placeholder}
              maxLength={12}
              autoCapitalize="characters"
              spellCheck={false}
              style={{ letterSpacing: ".12em" }}
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={join} disabled={pending || code.trim() === ""}>
            {pending ? COPY.joining : COPY.join}
          </button>
        </div>
      )}

      {error && (
        <p className="num" style={{ margin: "10px 0 0", fontSize: "11px", color: "var(--color-negative)" }}>
          {error}
        </p>
      )}

      <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--color-faint)", lineHeight: 1.6, maxWidth: "64ch" }}>
        {COPY.privacy}
      </p>
    </section>
  );
}
