import type { ReactNode } from "react";
import { Formula, Frac, N, Op, Pow, V, Where } from "@/components/ui/Formula";

/**
 * Each formula, set as an equation.
 *
 * Kept apart from `lib/screens/methodology.ts` so the content module stays
 * plain data and testable. A method with no entry here falls back to the plain
 * string, which is why every one of these is optional rather than required.
 */
export const FORMULAS: Record<string, ReactNode> = {
  trimp: (
    <>
      <Formula>
        <N>TRIMP</N><Op>=</Op>
        <V sub="min">t</V><Op>×</Op>
        <V sub="r">HR</V><Op>×</Op>
        <N>0.64</N><Op>×</Op>
        <Pow base={<V>e</V>} exp={<><N>1.92</N> <V sub="r">HR</V></>} />
      </Formula>
      <Formula>
        <V sub="r">HR</V><Op>=</Op>
        <Frac
          over={<><V sub="avg">HR</V><Op>−</Op><V sub="rest">HR</V></>}
          under={<><V sub="max">HR</V><Op>−</Op><V sub="rest">HR</V></>}
        />
      </Formula>
      <Where>
        <V sub="min">t</V> is the duration in minutes, and <V sub="r">HR</V> is where
        the run sat between your resting and maximum heart rate — 0 at rest, 1 flat out.
      </Where>
    </>
  ),

  ctl: (
    <>
      <Formula>
        <V sub="today">CTL</V><Op>=</Op>
        <V sub="yesterday">CTL</V><Op>+</Op>
        <Frac
          over={<><V sub="today">load</V><Op>−</Op><V sub="yesterday">CTL</V></>}
          under={<N>42</N>}
        />
      </Formula>
      <Where>
        Each day moves fitness a forty-second of the way toward that day&apos;s load. One
        big session barely shifts it; six weeks of them move it a long way.
      </Where>
    </>
  ),

  atl: (
    <>
      <Formula>
        <V sub="today">ATL</V><Op>=</Op>
        <V sub="yesterday">ATL</V><Op>+</Op>
        <Frac
          over={<><V sub="today">load</V><Op>−</Op><V sub="yesterday">ATL</V></>}
          under={<N>7</N>}
        />
      </Formula>
      <Where>The same arithmetic as fitness, six times faster to react.</Where>
    </>
  ),

  tsb: (
    <>
      <Formula>
        <N>TSB</N><Op>=</Op><N>CTL</N><Op>−</Op><N>ATL</N>
      </Formula>
      <Where>Fitness minus fatigue: what you have built, less what you are carrying.</Where>
    </>
  ),

  acwr: (
    <>
      <Formula>
        <N>ACWR</N><Op>=</Op>
        <Frac
          over={<><N>acute</N> <V sub="7d">EWMA</V></>}
          under={<><N>chronic</N> <V sub="28d">EWMA</V></>}
        />
      </Formula>
      <Where>
        Both averages are exponentially weighted and bias-corrected for the days actually
        recorded, so a gap in the log does not read as a week of rest.
      </Where>
    </>
  ),

  gap: (
    <>
      <Formula>
        <N>cost</N>(<V>i</V>)<Op>=</Op>
        <N>155.4</N><Pow base={<V>i</V>} exp={<N>5</N>} /><Op>−</Op>
        <N>30.4</N><Pow base={<V>i</V>} exp={<N>4</N>} /><Op>−</Op>
        <N>43.3</N><Pow base={<V>i</V>} exp={<N>3</N>} /><Op>+</Op>
        <N>46.3</N><Pow base={<V>i</V>} exp={<N>2</N>} /><Op>+</Op>
        <N>19.5</N><V>i</V><Op>+</Op><N>3.6</N>
      </Formula>
      <Formula>
        <N>GAP</N><Op>=</Op>
        <N>pace</N><Op>×</Op>
        <Frac over={<><N>cost</N>(<V>i</V>)</>} under={<><N>cost</N>(<N>0</N>)</>} />
      </Formula>
      <Where>
        <V>i</V> is the gradient — 0.05 is a 5% climb. The polynomial is the energy a
        metre of running costs at that slope, measured on a treadmill.
      </Where>
    </>
  ),

  drift: (
    <>
      <Formula>
        <N>drift</N><Op>=</Op>
        <span>(</span>
        <Frac
          over={<><N>HR / pace</N>, <N>second half</N></>}
          under={<><N>HR / pace</N>, <N>first half</N></>}
        />
        <Op>−</Op><N>1</N>
        <span>)</span>
        <Op>×</Op><N>100</N>
      </Formula>
      <Where>
        What one unit of pace cost your heart late in the run against what it cost early.
        Computed on steady runs only.
      </Where>
    </>
  ),

  riegel: (
    <>
      <Formula>
        <V sub="2">T</V><Op>=</Op>
        <V sub="1">T</V><Op>×</Op>
        <Pow
          base={<Frac over={<V sub="2">D</V>} under={<V sub="1">D</V>} />}
          exp={<N>1.06</N>}
        />
      </Formula>
      <Where>
        <V sub="1">T</V> is a time you have actually run over distance <V sub="1">D</V>;
        <V sub="2">T</V> is the prediction for distance <V sub="2">D</V>. The exponent
        above 1 is why doubling the distance costs more than doubling the time.
      </Where>
    </>
  ),

  readiness: (
    <>
      <Formula>
        <N>readiness</N><Op>=</Op>
        <N>Σ</N>
        <Frac
          over={<><V sub="i">w</V><Op>×</Op><N>z</N>(<V sub="i">x</V>)</>}
          under={<N>Σ</N>}
        />
      </Formula>
      <Where>
        Each input — form, load ratio, resting heart rate, HRV — is scored as
        <N> z</N>, how far it sits from <em>your own</em> 30-day baseline, then weighted
        and clamped to 0–100. An input you do not have drops out of the sum rather than
        counting as zero.
      </Where>
    </>
  ),
};
