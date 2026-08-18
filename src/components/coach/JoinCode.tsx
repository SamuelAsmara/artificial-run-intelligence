"use client";

/**
 * The coach's join code, with a copy button.
 *
 * A bearer credential, and the copy says so: anyone holding it can join, and
 * the way to revoke it is to issue a new one. Saying that out loud is cheaper
 * than a support conversation later.
 */

import { useState } from "react";
import { COACH_COPY } from "@/lib/screens/coachHome";

export function JoinCode({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission can be refused; the code is on screen either way.
      setCopied(false);
    }
  };

  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>
        {COACH_COPY.codeLabel}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span className="num" style={{ fontSize: "24px", fontWeight: 500, letterSpacing: ".16em", color: "var(--color-ink)" }}>
          {code ?? "——————"}
        </span>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={copy}
          disabled={!code}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          {copied ? COACH_COPY.copied : COACH_COPY.copyCode}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)" }}>{COACH_COPY.codeHint}</p>
    </div>
  );
}
