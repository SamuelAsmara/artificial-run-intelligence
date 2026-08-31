"use client";

/**
 * The mode toggle — coach ⇄ athlete.
 *
 * A coach who also runs, which is nearly all of them, used to get two rows of
 * navigation tabs stacked on top of each other: the coach's row, then the
 * athlete's. Two rows is clutter, and worse, it never said which of the two
 * sets of numbers you were currently looking at.
 *
 * This is one control instead. The accent carries the active mode, the label
 * beside it names it in words, and the whole strip stays on screen so the
 * answer to "whose data is this?" is always one glance away. That matters more
 * here than anywhere else in the product: a coach and an athlete see different
 * people's readiness, and a toggle that quietly changes whose numbers are on
 * screen is exactly how someone misreads a chart.
 *
 * Hidden on the coach screens themselves, which carry their own nav, and on the
 * sign-in screens, which have no nav at all.
 */

import { usePathname } from "next/navigation";
import { COACH_COPY } from "@/lib/screens/coachHome";

const HIDE_ON = ["/login", "/signup", "/auth"];

/** the coach's own screens — when we are on one of these, coach mode is active */
const COACH_ROUTES = ["/coach"];

const ATHLETE_ICON =
  "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0";
const COACH_ICON =
  "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 20h6a5 5 0 0 0-4-4.9";

export function CoachModeBar({ isCoach }: { isCoach: boolean }) {
  const pathname = usePathname();

  if (!isCoach) return null;
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const inCoachMode = COACH_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <div className="modebar">
      <div className="modebar-inner">
        {/*
            One control, two halves. The inactive half is a link rather than a
            button so the browser's own affordances — middle click, open in a
            new tab, the status bar showing where it goes — keep working.
        */}
        <div role="tablist" aria-label={COACH_COPY.modeLabel} className="nb-seg modebar-seg">
          <ModeHalf href="/coach" active={inCoachMode} icon={COACH_ICON} label={COACH_COPY.modeCoach} />
          <ModeHalf href="/dashboard" active={!inCoachMode} icon={ATHLETE_ICON} label={COACH_COPY.modeAthlete} />
        </div>

        {/*
            And the same state again in words. The control alone is a colour
            difference, and a colour difference is not enough to hang "whose
            readiness score is this" on.
        */}
        <span className="num modebar-note" style={{ color: inCoachMode ? "var(--color-accent)" : "var(--color-muted)" }}>
          {inCoachMode ? COACH_COPY.modeCoachNote : COACH_COPY.modeAthleteNote}
        </span>
      </div>
    </div>
  );
}

function ModeHalf({ href, active, icon, label }: { href: string; active: boolean; icon: string; label: string }) {
  return (
    <a href={href} role="tab" aria-selected={active} className={`nb-seg-btn modebar-half${active ? " is-on" : ""}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icon} />
      </svg>
      {label}
    </a>
  );
}
