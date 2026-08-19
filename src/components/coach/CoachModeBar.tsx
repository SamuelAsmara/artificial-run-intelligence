"use client";

/**
 * The strip a coach sees above the athlete screens.
 *
 * A coach who also runs — which is nearly all of them — needs both sides, and
 * the way to make that not feel like two applications is to keep the coach's
 * own navigation on screen while they are looking at their own training. So
 * this is the top row and the athlete's tabs are the second: you always know
 * which of the two you are in, and getting back is one click rather than a
 * URL.
 *
 * Hidden on the coach screens themselves, which carry their own nav, and on the
 * sign-in screens, which have no nav at all.
 */

import { usePathname } from "next/navigation";
import { COACH_COPY } from "@/lib/screens/coachHome";

const HIDE_ON = ["/coach", "/login", "/signup", "/auth"];

export function CoachModeBar({ isCoach }: { isCoach: boolean }) {
  const pathname = usePathname();

  if (!isCoach) return null;
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  return (
    <div
      style={{
        borderBlockEnd: "1px solid var(--color-line)",
        background: "var(--color-surface)",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          marginInline: "auto",
          padding: "8px 24px",
          display: "flex",
          alignItems: "center",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
          {COACH_COPY.coachTag}
        </span>
        <nav style={{ display: "flex", gap: "18px", fontSize: "12.5px" }}>
          <a href="/coach" style={{ color: "var(--color-muted)" }}>{COACH_COPY.navHome}</a>
          <a href="/coach/cycles" style={{ color: "var(--color-muted)" }}>{COACH_COPY.navCycles}</a>
          <a href="/coach/athletes" style={{ color: "var(--color-muted)" }}>{COACH_COPY.navAthletes}</a>
          <a href="/coach/settings" style={{ color: "var(--color-muted)" }}>{COACH_COPY.navSettings}</a>
        </nav>
        <div style={{ flex: 1 }} />
        <span className="num" style={{ fontSize: "11px", color: "var(--color-ink)" }}>
          {COACH_COPY.navMine}
        </span>
      </div>
    </div>
  );
}
