"use client";

/**
 * The coach's own notes.
 *
 * Private by construction — see the RLS policy in migration 0012. "Ask Dana
 * whether her calf is still sore" is a coach thinking aloud, and thinking aloud
 * stops being useful the moment the person it is about can read it.
 */

import { useState, useTransition } from "react";
import { addReminder, completeReminder, type Reminder } from "@/actions/coach";

export function Reminders({
  reminders,
  today,
  athletes,
}: {
  reminders: Reminder[];
  today: string;
  /** the roster, so a note can be attached to the person it is about */
  athletes: { id: string; name: string }[];
}) {
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  /*
   * Who the note is about.
   *
   * `addReminder` has always taken an athlete id, validated it against the
   * roster, and rendered the name on the note — and this component passed null
   * every time, so none of that was reachable. "Ask about the calf" is a
   * different note depending on whose calf it is.
   */
  const [athleteId, setAthleteId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    const text = body.trim();
    if (!text) return;
    setError("");
    startTransition(async () => {
      const result = await addReminder(text, due || null, athleteId || null);
      if (result.ok) {
        setBody("");
        setDue("");
        setAthleteId("");
      } else setError(result.error);
    });
  };

  const done = (id: string) => {
    startTransition(async () => {
      const result = await completeReminder(id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>Reminders</h2>
        <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>
          {reminders.length > 0 ? `${reminders.length} open` : "private to you"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {reminders.length === 0 ? (
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-faint)", lineHeight: 1.6 }}>
            Nothing noted. Anything you want to remember before the next session goes here.
          </p>
        ) : (
          reminders.map((r) => {
            const overdue = !!r.dueDate && r.dueDate < today;
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "start",
                  gap: "8px",
                  padding: "6px 0",
                  borderBlockEnd: "1px solid var(--color-line)",
                }}
              >
                <button
                  type="button"
                  onClick={() => done(r.id)}
                  disabled={pending}
                  aria-label="Mark done"
                  style={{
                    width: "14px", height: "14px", marginBlockStart: "2px", flex: "none",
                    borderRadius: "4px", cursor: "pointer",
                    border: "1px solid var(--color-line-strong)", background: "transparent",
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5 }}>{r.body}</p>
                  {(r.dueDate || r.athleteName) && (
                    <p className="num" style={{ margin: "2px 0 0", fontSize: "9.5px", color: overdue ? "var(--color-negative)" : "var(--color-faint)" }}>
                      {[r.athleteName, r.dueDate].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <input
          className="field"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a note…"
          maxLength={500}
          style={{ fontSize: "12px" }}
        />
        {athletes.length > 0 && (
          <select
            className="field"
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            style={{ fontSize: "11.5px" }}
            aria-label="Who is this about?"
          >
            <option value="">Not about anyone in particular</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            className="field"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            style={{ flex: 1, fontSize: "11.5px" }}
          />
          <button className="btn btn-secondary" type="button" onClick={add} disabled={pending || !body.trim()} style={{ padding: "6px 12px", fontSize: "11.5px" }}>
            Add
          </button>
        </div>
      </div>

      {error && (
        <p className="num" style={{ margin: 0, fontSize: "10.5px", color: "var(--color-negative)" }}>{error}</p>
      )}
    </div>
  );
}
