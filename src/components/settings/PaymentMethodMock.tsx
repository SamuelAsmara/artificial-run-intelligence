"use client";

import { useState } from "react";
import type { CoachTier } from "@/lib/billing/plans";

/**
 * The payment-method form — a mockup.
 *
 * There is no payment provider in this version, and this card does not
 * pretend otherwise: it is labelled as a mockup at the top, it asks for no
 * real card, and "Save card" writes nothing anywhere. It exists so that the
 * Billing tab shows the whole shape of the feature — package, card, history —
 * rather than a package with a hole under it, and so that the fields are
 * already where they will be when billing goes live.
 *
 * Everything typed here stays in component state and is gone on reload.
 */
const COPY = {
  title: "Payment method",
  tag: "Mockup",
  sub: "Billing is not connected in this version. This is the form you will fill in when it is — nothing typed here is stored or charged. Use any numbers, never a real card.",
  name: "Name on card",
  number: "Card number",
  expiry: "Expiry",
  cvc: "CVC",
  save: "Save card",
  saved: "Mockup — nothing was saved or charged.",
  historyTitle: "BILLING HISTORY",
  historyNone: "No charges yet.",
  premiumNote: "Premium is free for now. When billing goes live, the card on file is charged $10 a month from that day — never earlier, never without notice.",
  basicNote: "Basic is free for six months from the day you chose it, then $5 a month. A card is only needed when the free period ends.",
  athleteNote: "Basic is free, with no card and no end date. When Premium arrives, this is where the card goes.",
};

const digits = (s: string) => s.replace(/\D/g, "");

/** 4242 4242 4242 4242 */
const formatNumber = (s: string) => digits(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");

/** MM / YY */
const formatExpiry = (s: string) => {
  const d = digits(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
};

/** the brand, from the first digit — only ever a label, never a check */
const brandOf = (s: string) => {
  const d = digits(s);
  if (d.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex";
  return null;
};

export function PaymentMethodMock({ tier, audience = "coach" }: { tier: CoachTier | null; audience?: "coach" | "athlete" }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [note, setNote] = useState("");

  const brand = brandOf(number);
  const filled = name.trim().length > 0 && digits(number).length >= 12 && digits(expiry).length === 4 && digits(cvc).length >= 3;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNote(COPY.saved);
  };

  return (
    <section className="card" style={{ padding: "18px 24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{COPY.title}</h2>
          <span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-caution)", border: "1px dashed var(--color-line-strong)" }}>{COPY.tag}</span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--color-faint)", maxWidth: "64ch", lineHeight: 1.6 }}>{COPY.sub}</p>
      </div>

      <form onSubmit={onSubmit} autoComplete="off" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "10px 12px", maxWidth: "520px" }}>
        <Field label={COPY.name} span={6}>
          <input className="field" value={name} onChange={(e) => { setName(e.target.value); setNote(""); }} placeholder="Full name as printed on the card" autoComplete="off" />
        </Field>
        <Field label={COPY.number} span={6}>
          <div style={{ position: "relative" }}>
            <input
              className="field num" inputMode="numeric" value={number}
              onChange={(e) => { setNumber(formatNumber(e.target.value)); setNote(""); }}
              placeholder="0000 0000 0000 0000" autoComplete="off" style={{ paddingInlineEnd: brand ? "92px" : undefined }}
            />
            {brand ? (
              <span className="tag" style={{ position: "absolute", insetInlineEnd: "10px", top: "50%", transform: "translateY(-50%)", background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-line)" }}>{brand}</span>
            ) : null}
          </div>
        </Field>
        <Field label={COPY.expiry} span={3}>
          <input className="field num" inputMode="numeric" value={expiry} onChange={(e) => { setExpiry(formatExpiry(e.target.value)); setNote(""); }} placeholder="MM / YY" autoComplete="off" />
        </Field>
        <Field label={COPY.cvc} span={3}>
          <input className="field num" inputMode="numeric" value={cvc} onChange={(e) => { setCvc(digits(e.target.value).slice(0, 4)); setNote(""); }} placeholder="•••" autoComplete="off" />
        </Field>
        <div style={{ gridColumn: "span 6", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBlockStart: "4px" }}>
          <button className="btn btn-primary" type="submit" disabled={!filled}>{COPY.save}</button>
          <span className="num" style={{ fontSize: "11.5px", color: note ? "var(--color-caution)" : "var(--color-faint)" }}>
            {note || (audience === "athlete" ? COPY.athleteNote : tier === "premium" ? COPY.premiumNote : COPY.basicNote)}
          </span>
        </div>
      </form>

      <div style={{ paddingBlockStart: "14px", borderBlockStart: "1px solid var(--color-line)" }}>
        <p className="num" style={{ margin: "0 0 6px", fontSize: "10px", letterSpacing: ".12em", color: "var(--color-faint)" }}>{COPY.historyTitle}</p>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-faint)" }}>{COPY.historyNone}</p>
      </div>
    </section>
  );
}

function Field({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return (
    <label style={{ gridColumn: `span ${span}`, display: "flex", flexDirection: "column", gap: "5px" }}>
      <span className="num" style={{ fontSize: "9.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-faint)" }}>{label}</span>
      {children}
    </label>
  );
}
