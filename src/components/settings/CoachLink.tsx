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
import { Avatar } from "@/components/ui/Avatar";

const COPY = {
  title: "Coach",
  subHas: "They can see how you train, and change your plan.",
  subNone: "Not coached",
  /*
   * Said in words, not implied by an empty field.
   *
   * The card used to show only "Have a coach code? Enter it here." — an
   * athlete who was never sure whether their coach had linked them had no way
   * to tell from this screen whether the answer was no or whether the screen
   * simply had not loaded.
   */
  noneTitle: "You do not have a coach",
  noneBody:
    "Nobody else can see your training. If a coach gave you a code, enter it below and they will be able to read your runs and change your plan.",
  privacy:
    "Your coach sees your runs, your readiness and your plan. They never see how your account is connected or any key you have entered.",
  field: "Coach code",
  /*
   * Empty on purpose. A sample code sitting in the field reads as a real one —
   * more than one person has typed "ABC123" in and been told it is invalid.
   */
  placeholder: "",
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
          <Avatar src={coach.avatarUrl ?? null} name={coach.name} size={40} />
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "13.5px", fontWeight: 500 }}>{coach.name}</p>
            {coach.bio ? (
              <p style={{ margin: "3px 0 0", fontSize: "11.5px", color: "var(--color-muted)", lineHeight: 1.55, textWrap: "pretty" }}>
                {coach.bio}
              </p>
            ) : null}
            <p className="num" style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--color-faint)" }}>
              {COPY.since} {coach.since.slice(0, 10)}
            </p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={leave} disabled={pending}>
            {pending ? COPY.leaving : COPY.leave}
          </button>
        </div>
      ) : (
        <div style={{ marginBlockStart: "12px" }}>
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "11px",
          padding: "11px 13px", marginBlockEnd: "14px",
          borderRadius: "var(--radius-control)",
          background: "var(--color-elevated)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginBlockStart: "1px" }} aria-hidden>
            <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 20h6a5 5 0 0 0-4-4.9" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 500 }}>{COPY.noneTitle}</p>
            <p style={{ margin: "3px 0 0", fontSize: "11.5px", color: "var(--color-muted)", lineHeight: 1.6, textWrap: "pretty" }}>
              {COPY.noneBody}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
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
