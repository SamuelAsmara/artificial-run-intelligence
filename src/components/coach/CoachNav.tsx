/**
 * The coach's header.
 *
 * Deliberately not the athlete's nav with different links. A coach's tabs are
 * Home, Athletes and Templates — there is no "Activities", because a coach does
 * not have activities, they have people who do.
 */

import { COACH_COPY } from "@/lib/screens/coachHome";

export function CoachNav({
  active,
}: {
  active: "home" | "cycles" | "athletes" | "templates" | "mine" | "settings";
}) {
  const link = (key: string, href: string, label: string) => (
    <a
      key={key}
      href={href}
      style={{ color: active === key ? "var(--color-ink)" : "var(--color-muted)" }}
    >
      {label}
    </a>
  );

  return (
    <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }} />
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
          The coach's own training. Almost every running coach runs, and a
          single-role account forces a choice nobody should have to make — so
          this is one nav item rather than a second account. It opens the
          athlete side, which has its own row of tabs underneath.
        */}
        {link("mine", "/dashboard", COACH_COPY.navMine)}
      </nav>
      <div style={{ flex: 1 }} />
      <a
        href="/coach/settings"
        style={{ fontSize: "13px", color: active === "settings" ? "var(--color-ink)" : "var(--color-muted)" }}
      >
        {COACH_COPY.navSettings}
      </a>
    </header>
  );
}
