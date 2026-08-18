"use client";

/**
 * Email and password — the third card of the new Settings handoff.
 *
 * ## Why each change re-authenticates first
 *
 * The design promises "Changes require your password", and Supabase does not
 * enforce that on its own: `updateUser({ email })` and `updateUser({ password })`
 * both succeed on nothing more than a live session. That is the classic
 * unattended-laptop hole — anyone who finds the tab open can move the account
 * to their own address and lock the owner out.
 *
 * So both rows sign in again with the current password before changing
 * anything. `signInWithPassword` against the address already on file either
 * proves the person at the keyboard owns the account or fails, and only then
 * does the update run. One extra round trip, hole closed.
 *
 * The email row is also careful about what it claims. Supabase mails a
 * confirmation to the *new* address and only switches once that link is
 * clicked, so the row reports the change as pending rather than done.
 */

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { SET_COPY } from "@/lib/screens/settings";

const copy = SET_COPY;

const boxStyle = {
  border: "1px solid var(--color-line)",
  borderRadius: "var(--radius-control)",
} as const;

const headStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 14px",
} as const;

const bodyStyle = {
  borderBlockStart: "1px solid var(--color-line)",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
};

const btnSmall = { padding: "7px 13px", fontSize: "12px" } as const;
const btnPrimary = { padding: "7px 14px", fontSize: "12px" } as const;

function Note({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return (
    <p
      className="num"
      style={{
        margin: 0,
        fontSize: "11px",
        color: tone === "ok" ? "var(--color-positive)" : "var(--color-negative)",
      }}
    >
      {children}
    </p>
  );
}

export function AccountSecurity({ email }: { email: string }) {
  return (
    <div className="set-grid" style={{ marginBlockStart: "14px" }}>
      <EmailBox email={email} />
      <PasswordBox email={email} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EmailBox({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    setOpen((o) => !o);
    setNext(email);
    setPassword("");
    setError("");
    setDone("");
  };

  const submit = () => {
    const address = next.trim();
    if (!address.includes("@")) return setError("Enter a valid email address.");
    if (address.toLowerCase() === email.toLowerCase()) return setError("That's already your address.");

    setError("");
    setDone("");
    startTransition(async () => {
      const supabase = createClient();
      // Prove it is really the account owner before moving the account.
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) return setError("That password doesn't match this account.");

      const { error: updErr } = await supabase.auth.updateUser({ email: address });
      if (updErr) return setError(updErr.message);

      setDone(`Check ${address} — the address changes once you confirm from there.`);
      setPassword("");
    });
  };

  return (
    <div style={boxStyle}>
      <div style={headStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="lbl" style={{ marginBlockEnd: "2px" }}>{copy.curEmail}</span>
          <p
            className="num"
            style={{ margin: 0, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {email}
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={toggle} style={btnSmall}>
          {open ? copy.close : copy.change}
        </button>
      </div>

      {open ? (
        <div style={bodyStyle}>
          <div>
            <label htmlFor="s-email" className="lbl">{copy.newEmail}</label>
            <input
              id="s-email" className="field" type="email" autoComplete="email"
              value={next} onChange={(e) => setNext(e.target.value)} placeholder="you@run.com"
            />
          </div>
          <div>
            <label htmlFor="s-email-pass" className="lbl">{copy.confirmPass}</label>
            <input
              id="s-email-pass" className="field" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>
          {error ? <Note tone="bad">{error}</Note> : null}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              className="btn btn-primary" type="button" onClick={submit}
              disabled={pending || !password} style={btnPrimary}
            >
              {pending ? copy.saving : copy.updEmail}
            </button>
          </div>
        </div>
      ) : null}

      {done ? (
        <p
          className="num"
          style={{ margin: 0, padding: "0 14px 12px", fontSize: "11px", color: "var(--color-positive)" }}
        >
          {done}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PasswordBox({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    setOpen((o) => !o);
    setCurrent("");
    setNext("");
    setError("");
    setDone(false);
  };

  const submit = () => {
    if (next.length < 8) return setError("Use at least 8 characters.");
    if (next === current) return setError("That's the password you already have.");

    setError("");
    setDone(false);
    startTransition(async () => {
      const supabase = createClient();
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (authErr) return setError("That current password doesn't match.");

      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) return setError(updErr.message);

      setDone(true);
      setCurrent("");
      setNext("");
      setOpen(false);
    });
  };

  return (
    <div style={boxStyle}>
      <div style={headStyle}>
        <div style={{ flex: 1 }}>
          <span className="lbl" style={{ marginBlockEnd: "2px" }}>{copy.passTitle}</span>
          <p className="num" style={{ margin: 0, fontSize: "13px", letterSpacing: ".2em" }}>
            {"••••••••"}
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={toggle} style={btnSmall}>
          {open ? copy.close : copy.change}
        </button>
      </div>

      {open ? (
        <div style={bodyStyle}>
          <div>
            <label htmlFor="s-pass0" className="lbl">{copy.curPass}</label>
            <input
              id="s-pass0" className="field" type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••"
            />
          </div>
          <div>
            <label htmlFor="s-pass1" className="lbl">{copy.newPass}</label>
            <input
              id="s-pass1" className="field" type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} placeholder="min. 8 characters"
            />
          </div>
          {error ? <Note tone="bad">{error}</Note> : null}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              className="btn btn-primary" type="button" onClick={submit}
              disabled={pending || !current || !next} style={btnPrimary}
            >
              {pending ? copy.saving : copy.updPass}
            </button>
          </div>
        </div>
      ) : null}

      {done ? (
        <p
          className="num"
          style={{ margin: 0, padding: "0 14px 12px", fontSize: "11px", color: "var(--color-positive)" }}
        >
          {copy.passMsg}
        </p>
      ) : null}
    </div>
  );
}
