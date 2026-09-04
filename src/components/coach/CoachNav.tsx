/**
 * The coach's header.
 *
 * Deliberately not the athlete's nav with different links. A coach's tabs are
 * Home, Athletes and Templates — there is no "Activities", because a coach does
 * not have activities, they have people who do.
 */

import { COACH_COPY } from "@/lib/screens/coachHome";
import { BrandMark } from "@/components/ui";
import Link from "next/link";

export function CoachNav({
  active,
}: {
  active: "home" | "cycles" | "athletes" | "templates" | "settings";
}) {
  const link = (key: string, href: string, label: string) => (
    <Link
      key={key}
      href={href}
      style={{ color: active === key ? "var(--color-ink)" : "var(--color-muted)" }}
    >
      {label}
    </Link>
  );

  return (
    <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <BrandMark />
        <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>
          {COACH_COPY.brand}
        </span>
        <span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", marginInlineStart: "4px" }}>
          {COACH_COPY.coachTag}
        </span>
      </div>
      <nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px" }}>
        {link("home", "/coach", COACH_COPY.navHome)}
        {link("cycles", "/coach/cycles", COACH_COPY.navCycles)}
        {link("athletes", "/coach/athletes", COACH_COPY.navAthletes)}
        {/*
          Templates were reachable only through a button on the settings page,
          which is a strange place for the thing that decides what every plan
          looks like — and easy to lose once you have left it.
        */}
        {link("templates", "/coach/templates", COACH_COPY.navTemplates)}
        {/*
          The coach's own training used to be a nav item here. It is the mode
          toggle in the strip above now — one control for "whose numbers am I
          looking at", not a control and a link that do the same thing.
        */}
      </nav>
      <div style={{ flex: 1 }} />
      <Link
        href="/coach/settings"
        style={{ fontSize: "13px", color: active === "settings" ? "var(--color-ink)" : "var(--color-muted)" }}
      >
        {COACH_COPY.navSettings}
      </Link>
    </header>
  );
}
