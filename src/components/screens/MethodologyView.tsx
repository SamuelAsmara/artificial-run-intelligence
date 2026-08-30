"use client";

/**
 * The methodology page — every figure in Runi, explained.
 *
 * One page for both audiences, at two depths. The plain sentence, the bands
 * and the limit are always visible; the formula is a disclosure, open by
 * default for a coach because a coach is being asked to stake twenty athletes'
 * training on these numbers and is entitled to check the arithmetic.
 *
 * Prose is left-aligned throughout. The stat tiles elsewhere are centred
 * because they sit in a row of equal cells; a paragraph never is.
 */

import { useState } from "react";
import { METHODS, METHOD_COPY, type Method } from "@/lib/screens/methodology";
import { Entrance, BrandMark, SectionHeader } from "@/components/ui";
import { FORMULAS } from "./methodologyFormulas";

const NAV = { home: "Home", plan: "Plan", activities: "Activities", settings: "Settings" };

export function MethodologyView({ isCoach = false }: { isCoach?: boolean }) {
  return (
    <div data-entrance-root style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><Entrance />
      <header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <BrandMark />
          <span className="num" style={{ fontWeight: 500, fontSize: "16px", letterSpacing: ".12em" }}>Runi</span>
        </div>
        <div style={{ textAlign: "start" }}>
          <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{METHOD_COPY.title}</h1>
          <p style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>{METHOD_COPY.subtitle}</p>
        </div>
        <nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}>
          <a href="/dashboard" style={{ color: "var(--color-muted)" }}>{NAV.home}</a>
          <a href="/plan" style={{ color: "var(--color-muted)" }}>{NAV.plan}</a>
          <a href="/activities" style={{ color: "var(--color-muted)" }}>{NAV.activities}</a>
          <a href="/settings" style={{ color: "var(--color-ink)" }}>{NAV.settings}</a>
        </nav>
        <div style={{ flex: 1 }} />
        <a className="btn btn-secondary" href="/settings" style={{ padding: "6px 12px", fontSize: "12px" }}>
          {METHOD_COPY.back}
        </a>
      </header>

      <section className="card" style={{ padding: "18px 22px" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)", lineHeight: 1.7, maxWidth: "76ch", textWrap: "pretty" }}>
          {METHOD_COPY.intro}
        </p>
      </section>

      {METHODS.map((m) => (
        <MethodCard key={m.id} method={m} openByDefault={isCoach} />
      ))}
    </div>
  );
}

function MethodCard({ method, openByDefault }: { method: Method; openByDefault: boolean }) {
  const [open, setOpen] = useState(openByDefault);

  return (
    <section className="card" style={{ padding: "18px 22px" }} id={method.id}>
      <SectionHeader title={method.name} hint={method.seenOn} />

      <p style={{ margin: "10px 0 0", fontSize: "13.5px", lineHeight: 1.7, maxWidth: "76ch", textWrap: "pretty" }}>
        {method.plain}
      </p>

      {/* How to read it: the bands, as a table rather than a paragraph. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginBlockStart: "14px", maxWidth: "620px" }}>
        <span style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-faint)", marginBlockEnd: "6px" }}>
          {METHOD_COPY.howRead}
        </span>
        {method.scale.map((band) => (
          <div
            key={band.value}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(96px, 150px) 1fr",
              gap: "14px",
              padding: "7px 10px",
              borderRadius: "var(--radius-control)",
              background: "var(--color-elevated)",
            }}
          >
            <span className="num" style={{ fontSize: "11.5px", color: "var(--color-ink)" }}>{band.value}</span>
            <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{band.meaning}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          marginBlockStart: "14px", padding: 0, background: "none", border: "none",
          color: "var(--color-accent)", fontSize: "12px", fontFamily: "inherit", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: "6px",
        }}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
          aria-hidden
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {open ? METHOD_COPY.hideFormula : METHOD_COPY.showFormula}
      </button>

      {open ? (
        /*
            Set as an equation, not printed as code.
            The plain string is still there as a fallback for any method that
            has no typeset version yet — better a readable line than nothing.
        */
        FORMULAS[method.id] ?? (
          <p className="num" style={{
            margin: "12px 0 0", padding: "14px 16px",
            borderRadius: "var(--radius-control)", background: "var(--color-elevated)",
            fontSize: "12.5px", lineHeight: 1.8, color: "var(--color-ink)",
            overflowX: "auto",
          }}>
            {method.formula}
          </p>
        )
      ) : null}

      {/*
          The limit. This is the field that keeps the page honest — a page that
          only explained how each number is computed would read as a claim that
          each number is right.
      */}
      <div style={{ marginBlockStart: "14px", paddingBlockStart: "12px", borderBlockStart: "1px solid var(--color-line)" }}>
        <span style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-caution)" }}>
          {METHOD_COPY.limitLabel}
        </span>
        <p style={{ margin: "5px 0 0", fontSize: "12.5px", color: "var(--color-muted)", lineHeight: 1.65, maxWidth: "76ch", textWrap: "pretty" }}>
          {method.limit}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>
          {METHOD_COPY.sourceLabel} · {method.source}
        </p>
      </div>
    </section>
  );
}
