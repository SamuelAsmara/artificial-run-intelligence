"use client";

/**
 * The coach's join code, with a copy button.
 *
 * A bearer credential, and the copy says so: anyone holding it can join, and
 * the way to revoke it is to issue a new one. Saying that out loud is cheaper
 * than a support conversation later.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueCoachCode } from "@/actions/coach";
import { COACH_COPY } from "@/lib/screens/coachHome";

export function JoinCode({ code }: { code: string | null }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const shown = issued ?? code;

  /*
   * Issuing has to be a button.
   *
   * Reading the code used to mint one as a side effect of loading the page,
   * which meant a bearer credential could be created by anything that happened
   * to render this card. Migration 0013 made the read read-only — correctly —
   * and then nothing called `issue_coach_code`, so a new coach landed on six em
   * dashes, a greyed-out Copy button, and no way to ever get a code. The whole
   * coaching half of the product was unreachable.
   */
  const issue = () => {
    setError("");
    startTransition(async () => {
      const result = await issueCoachCode();
      if (!result.ok) return setError(result.error);
      setIssued(result.data);
      router.refresh();
    });
  };

  const copy = async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown);
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
        <span className="num" style={{ fontSize: "24px", fontWeight: 500, letterSpacing: ".16em", color: shown ? "var(--color-ink)" : "var(--color-faint)" }}>
          {shown ?? "——————"}
        </span>
        {shown ? (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={copy}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            {copied ? COACH_COPY.copied : COACH_COPY.copyCode}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={issue}
            disabled={pending}
            style={{ padding: "6px 12px", fontSize: "12px", cursor: pending ? "progress" : "pointer" }}
          >
            {pending ? COACH_COPY.issuing : COACH_COPY.issueCode}
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: "11px", color: "var(--color-faint)" }}>
        {shown ? COACH_COPY.codeHint : COACH_COPY.codeHintNone}
      </p>
      {error ? (
        <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-negative)" }}>{error}</p>
      ) : null}
    </div>
  );
}
