import type { ReactNode } from "react";

/**
 * A formula, set as typography rather than printed as code.
 *
 * The methodology page put each formula in a `<pre>` with a mono font on a dark
 * ground, which reads as a code listing — the opposite of what the page is for.
 * A reader who does not write software sees a script and stops.
 *
 * So: no LaTeX engine and no dependency (two weeks before submission is the
 * wrong moment to add one to the clean-clone path), but real mathematical
 * typography built from the tokens already in the system — a fraction with an
 * actual rule and the numerator above the denominator, exponents raised,
 * subscripts dropped, operators spaced the way an equation is spaced.
 *
 * The building blocks are deliberately small. Anything more elaborate than
 * these is a sign the formula should be explained in a sentence instead.
 */

/** the whole equation, centred on its own line */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "var(--formula-justify, center)",
        flexWrap: "wrap",
        gap: "8px",
        // A little air above and below: an equation crowded against prose reads
        // as part of the sentence. A container can tighten this (the Numbers
        // panel does) by setting the --formula-* custom properties.
        padding: "var(--formula-pad, 18px 16px)",
        marginBlockStart: "var(--formula-gap, 12px)",
        borderRadius: "var(--radius-control)",
        background: "var(--color-elevated)",
        fontSize: "var(--formula-size, 15px)",
        lineHeight: 1.2,
        color: "var(--color-ink)",
        overflowX: "auto",
      }}
    >
      {children}
    </div>
  );
}

/** a named quantity — italic, the way variables are always set */
export function V({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <span style={{ fontStyle: "italic", whiteSpace: "nowrap" }}>
      {children}
      {sub !== undefined ? (
        <sub style={{ fontStyle: "normal", fontSize: "0.66em", opacity: 0.85 }}>{sub}</sub>
      ) : null}
    </span>
  );
}

/** a plain number or a function name — upright, never italic */
export function N({ children }: { children: ReactNode }) {
  return <span className="num" style={{ whiteSpace: "nowrap" }}>{children}</span>;
}

/** ×, −, =, ÷ — spaced, and quieter than the terms they join */
export function Op({ children }: { children: ReactNode }) {
  return (
    <span style={{ marginInline: "5px", color: "var(--color-muted)" }}>{children}</span>
  );
}

/**
 * A fraction with a real rule.
 *
 * This is the whole reason the module exists: `a / b` on one line is the thing
 * that makes a formula look like source code.
 */
export function Frac({ over, under }: { over: ReactNode; under: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        verticalAlign: "middle",
        marginInline: "4px",
      }}
    >
      <span style={{ padding: "0 6px 3px" }}>{over}</span>
      <span
        style={{
          width: "100%",
          height: "1px",
          background: "var(--color-line-strong)",
        }}
      />
      <span style={{ padding: "3px 6px 0" }}>{under}</span>
    </span>
  );
}

/** a raised exponent */
export function Pow({ base, exp }: { base: ReactNode; exp: ReactNode }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {base}
      <sup style={{ fontSize: "0.66em", lineHeight: 0 }}>{exp}</sup>
    </span>
  );
}

/** a note under the equation — "where HRr is …" */
export function Where({ children }: { children: ReactNode }) {
  return (
    <p style={{
      margin: "8px 0 0", fontSize: "11.5px", color: "var(--color-faint)",
      lineHeight: 1.6, textAlign: "var(--formula-align, center)" as "center", textWrap: "pretty",
    }}>
      {children}
    </p>
  );
}
