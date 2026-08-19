"use client";

/**
 * Setting a new password after following a recovery link.
 *
 * The link has already established a session by the time this renders — that is
 * what the recovery token buys — so this only has to collect a new password and
 * call `updateUser`. It deliberately does not ask for the current one: the
 * whole premise is that it is not known.
 */

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_COPY, MIN_PASSWORD } from "@/lib/screens/login";



export function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState(params.get("error") ? "That link has expired. Ask for a new one." : "");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pass.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (pass !== again) return setError("Those two do not match.");
    setError("");

    startTransition(async () => {
      const supabase = createClient();

      // No session means the link was never followed, or has expired. Saying so
      // is more use than a generic failure.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return setError("This link is no longer valid. Ask for a new one from the sign-in screen.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: pass });
      if (updateError) return setError(updateError.message);

      setDone(true);
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--color-canvas)",
      }}
    >
      <div className="card" style={{ width: "min(380px, 94vw)", padding: "28px 26px" }}>
        <h1 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>Set a new password</h1>
        <p style={{ margin: "4px 0 18px", fontSize: "12px", color: "var(--color-muted)" }}>
          {LOGIN_COPY.brand} · choose something you have not used elsewhere.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: "5px", marginBlockEnd: "12px" }}>
          <span className="lbl">New password</span>
          <input
            className="afield"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "5px", marginBlockEnd: "16px" }}>
          <span className="lbl">Repeat it</span>
          <input
            className="afield"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoComplete="new-password"
          />
        </label>

        <button
          className="btn btn-primary"
          type="button"
          onClick={submit}
          disabled={pending || done}
          style={{ width: "100%" }}
        >
          {done ? "Saved" : pending ? "Saving…" : "Save password"}
        </button>

        {error && (
          <p className="num" style={{ margin: "12px 0 0", fontSize: "11.5px", color: "var(--color-negative)" }}>
            {error}
          </p>
        )}

        <p style={{ margin: "16px 0 0", fontSize: "11px", color: "var(--color-faint)", textAlign: "center" }}>
          <a href="/login" style={{ color: "var(--color-accent)" }}>Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
