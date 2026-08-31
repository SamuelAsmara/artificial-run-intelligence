import type { ReactNode } from "react";
import { Formula, Frac, N, Op, V, Where } from "@/components/ui/Formula";
import { FORMULAS } from "@/components/screens/methodologyFormulas";

/**
 * The typeset formula for each Numbers tile.
 *
 * The nine methods already had equations set for the old methodology page;
 * those are reused as they are. The four input tiles (heart rate, pace,
 * volume, recovery) never had one, so they get theirs here — kept as short as
 * the arithmetic actually is. A tile with no entry falls back to the one-line
 * string in the model.
 */
export const NUMBERS_FORMULAS: Record<string, ReactNode> = {
  ...FORMULAS,

  hr: (
    <>
      <Formula>
        <V>zone</V><Op>←</Op>
        <Frac over={<V sub="avg">HR</V>} under={<N>LTHR</N>} /><Op>×</Op><N>100</N>
      </Formula>
      <Where>
        Z1 below 85% · Z2 85–90 · Z3 90–95 · Z4 95–100 · Z5 100–103 · Z6 above. Your
        <N> LTHR</N> is the highest heart rate you can hold for about an hour.
      </Where>
    </>
  ),

  pace: (
    <>
      <Formula>
        <V>pace</V><Op>=</Op>
        <Frac over={<>moving time</>} under={<>distance</>} />
      </Formula>
      <Where>Minutes per kilometre, uncorrected — the hill correction lives in GAP.</Where>
    </>
  ),

  volume: (
    <>
      <Formula>
        <V sub="week">km</V><Op>=</Op>
        <N>Σ</N> <V>distance</V><span style={{ fontSize: "0.8em", color: "var(--color-muted)" }}>, Sunday → Saturday</span>
      </Formula>
      <Where>The plan ramps this by at most 7–9% a week, and drops it about 25% every fourth week.</Where>
    </>
  ),

  // The methodology page's version described z-scores against a 30-day
  // baseline, which is not what lib/planning/readiness.ts does. This is.
  readiness: (
    <>
      <Formula>
        <N>readiness</N><Op>=</Op>
        <Frac
          over={<><N>Σ</N> <V sub="i">w</V><Op>×</Op><V sub="i">sub</V></>}
          under={<><N>Σ</N> <V sub="i">w</V></>}
        />
      </Formula>
      <Where>
        Each input — form, load ratio, cardiac drift, and with a wellness source sleep and
        HRV — is first scored 0–100 on its own, then weighted. Load only: form 45 · ratio 30 ·
        drift 25. With recovery: 35 · 20 · 15 · sleep 20 · HRV 10. An input you do not have
        drops out and its weight is shared among the rest, so a missing signal never drags
        the score toward zero.
      </Where>
    </>
  ),

  recovery: (
    <>
      <Formula>
        <V sub="sleep">score</V><Op>=</Op><N>100</N>
        <span style={{ color: "var(--color-muted)" }}> at ≥ 8 h, falling below 7 h</span>
      </Formula>
      <Formula>
        <V sub="HRV">score</V><Op>←</Op>
        <Frac over={<>last night</>} under={<>your 7-day baseline</>} />
      </Formula>
      <Where>With a wellness source connected the readiness weights become form 35 · ratio 20 · drift 15 · sleep 20 · HRV 10.</Where>
    </>
  ),
};
