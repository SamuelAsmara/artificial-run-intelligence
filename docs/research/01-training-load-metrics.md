# Brief 1 — Quantifying training load

What we can compute from `activities` (`distance_m`, `duration_s`, `avg_hr`, `avg_pace`), and why.

## Recommendation

**HRSS — normalised Banister TRIMP, where 100 = one hour at threshold heart rate.**
Fallback when HR is missing: **rTSS** from average speed. Optional enrichment: **session-RPE**.

## 1. Banister TRIMP

```
ΔHR   = (HR_avg − HR_rest) / (HR_max − HR_rest)      // heart-rate reserve, 0..1
TRIMP = duration_min · ΔHR · a · e^(b · ΔHR)
```

Coefficients fitted to the blood-lactate response (Banister 1991; Green et al.):

| Sex | a | b |
|---|---|---|
| Male | 0.64 | 1.92 |
| Female | 0.86 | 1.67 |

⚠️ The literature disagrees on `a` — many implementations (Fellrnr, Elevate) use 0.64 for both
sexes. **Normalising removes the problem**: `a` is a multiplicative constant that appears in
both numerator and denominator and cancels exactly. Only `b` survives.

## 2. HRSS — the metric we implement

```
HRSS = 100 · TRIMP(session) / TRIMP(1 hour at LTHR)
```

```ts
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const COEFFS = { male: { a: 0.64, b: 1.92 }, female: { a: 0.86, b: 1.67 } };

export function banisterTrimp(
  durationSec: number, hrAvg: number, hrRest: number, hrMax: number,
  sex: "male" | "female",
): number {
  const { a, b } = COEFFS[sex];
  const dHR = clamp01((hrAvg - hrRest) / (hrMax - hrRest));
  return (durationSec / 60) * dHR * a * Math.exp(b * dHR);
}

/** 100 == one hour at threshold heart rate. */
export function hrss(
  durationSec: number, hrAvg: number, hrRest: number, hrMax: number,
  lthr: number, sex: "male" | "female",
): number {
  const oneHourAtThreshold = banisterTrimp(3600, lthr, hrRest, hrMax, sex);
  return oneHourAtThreshold > 0
    ? (100 * banisterTrimp(durationSec, hrAvg, hrRest, hrMax, sex)) / oneHourAtThreshold
    : 0;
}
```

### Why normalising is decisive

HRmax and HRrest are *estimated* in a consumer app, so the metric must tolerate error in them.
Computed for 60 min at 150 bpm, sweeping the estimates:

| | spread across HRmax 180–200 and HRrest 45–65 |
|---|---|
| Raw TRIMP | 81 → 133 = **±25%** |
| HRSS | **±2%** (HRmax) / ±6% (HRrest) |

A ±10 bpm error in HRmax moves HRSS by about one point.

## 3. TSS family (TrainingPeaks)

```
TSS = 100 · (duration_sec / 3600) · IF²        where IF = NP / FTP
```

Linear in duration, quadratic in relative intensity. 100 = one hour at threshold.

**rTSS** substitutes Normalized Graded Pace for power. Unit trap: NGP and threshold must both
be *speeds* (m/s), or the ratio inverts when using pace.

```ts
export function rTSS(durationSec: number, ngpSpeed: number, thresholdSpeed: number): number {
  if (thresholdSpeed <= 0) return 0;
  const IF = ngpSpeed / thresholdSpeed;
  return 100 * (durationSec / 3600) * IF * IF;
}
```

⚠️ **NGP is proprietary and undocumented.** Any implementation is an approximation — say so.
rTSS also systematically under-reads on hills and trails, which TrainingPeaks itself acknowledges.

**hrTSS** has no published formula either. In practice the ecosystem implements it as HRSS above.

## 4. Session-RPE (Foster 2001)

```
sRPE load (AU) = RPE (Borg CR-10) × duration_min
Monotony       = mean(daily load, 7d) / SD(daily load, 7d)
Strain         = weekly load × monotony
```

Correlates with HR-based load at pooled r = 0.74 (16 studies, 278 athletes). **But** collapses
on intermittent work (r = 0.14–0.31) and on sessions under 30 min, and produces missing data in
an app. Treat as opt-in enrichment, never primary.

## 5. What averages cost us

Every load metric applies a **convex** function to intensity, so by Jensen's inequality
`f(mean(x)) < mean(f(x))`: using average HR **systematically under-scores variable sessions and
never over-scores them**.

Three 60-minute sessions, all with mean HR 150:

| Session | TRIMP from stream | from average | under-estimate |
|---|---|---|---|
| Steady @ 150 | 108.1 | 108.1 | **0%** |
| 30 min @ 175 + 30 min @ 125 | 124.0 | 108.1 | **12.8%** |
| 6 × (5 min @ 182 / 5 min @ 118) | 134.4 | 108.1 | **19.5%** |

Other losses: no cardiac-lag correction, no drift detection (long hot runs over-score), no grade
correction, no variability index to even flag the problem. The quadratic rTSS family degrades far
more gently (~4–10%).

**Product decision:** store the method and a confidence flag with every score, and disclose in the
UI that interval sessions may be under-scored by 10–20%.

## 6. Estimating LTHR and threshold pace from history

No lab test, no dedicated field test. What the platforms do:

| Platform | Rule |
|---|---|
| TrainingPeaks | Threshold HR from peak 60-min HR, or 95% of peak 20-min. Threshold pace from peak 45-min pace. |
| intervals.icu | Threshold HR = 98% of peak 20-min HR. Only ever suggests increases. |
| Friel (manual) | 30-min solo time trial; average HR of the **last 20 minutes**. |

### Our algorithm (summary fields only)

An activity's average HR *is* its sustained HR over that duration, so a filtered maximum of
`avg_hr` is a legitimate proxy for a peak-sustained-HR curve.

1. Filter to runs 20–75 min with plausible HR.
2. Take the **95th percentile** of `avg_hr` per duration bucket — not the max (rejects strap
   dropouts and hot-day outliers).
3. Duration correction: ×0.98 for 20–30 min efforts, ×0.99 for 30–45, ×1.00 for 45–75.
4. Clamp: `0.80 × HRmax ≤ LTHR ≤ 0.94 × HRmax`.
5. Require the effort to look hard (`avg_hr ≥ 0.85 × HRmax`), else the estimate is a floor.
6. **Ratchet**: allow increases immediately, decreases only after weeks with no qualifying effort.
   One hot or ill session must never collapse the whole CTL series.

**HRmax**, best to worst: highest observed → short all-out effort × 1.03 → **Tanaka**
`208 − 0.7 × age` (accurate in men, overestimates ~4.9 bpm in women) → Fox `220 − age` (worse).

**Threshold pace**: fastest average speed among 35–75 min runs, gated on
`avg_hr ≥ 0.90 × LTHR`. Or Riegel `T2 = T1 × (D2/D1)^1.06` (restrict to ≤3× distance ratio).
Or critical-speed regression over best efforts of 2–20 min:

```ts
/** Fit distance = CS·time + D' over best efforts. */
export function fitCriticalSpeed(efforts: { distanceM: number; timeSec: number }[]) {
  const n = efforts.length;
  if (n < 2) return null;
  const sx = efforts.reduce((a, e) => a + e.distanceM, 0) / n;
  const sy = efforts.reduce((a, e) => a + e.timeSec, 0) / n;
  const num = efforts.reduce((a, e) => a + (e.distanceM - sx) * (e.timeSec - sy), 0);
  const den = efforts.reduce((a, e) => a + (e.distanceM - sx) ** 2, 0);
  if (den === 0) return null;
  const m = num / den;
  return { criticalSpeedMps: 1 / m, dPrimeM: -(sy - m * sx) * (1 / m) };
}
```

**Cold start:** until three qualifying efforts exist, seed `LTHR = 0.88 × HRmax`, mark confidence
`low`, display load but do not drive coaching from it.

## 7. Honest limitation to state in the report

Dose–response evidence (Sanders et al. 2017, competitive cyclists) ranks plain Banister TRIMP
**last** among HR-based methods:

| Metric | Δ power @ 2 mmol | Δ 8-min TT |
|---|---|---|
| iTRIMP | 0.81 | 0.63 |
| TSS | 0.75 | 0.41 |
| Lucía TRIMP | 0.67 | **0.70** |
| Edwards TRIMP | 0.64 | 0.48 |
| **Banister TRIMP** | **0.52** | 0.40 |

The metrics that beat it (iTRIMP, Lucía) require a **laboratory lactate or gas-analysis ramp
test** and are unobtainable in a consumer app. The defensible framing is: *among obtainable
methods, normalised Banister TRIMP is the best-conditioned; its known dose–response weakness is
partly attributable to the group-level exponent, which we mitigate by normalising to the
individual's own LTHR.*

Also cite Passfield et al. 2022, *Validity of the Training-Load Concept* — the standard critique
that collapsing a session to one scalar is itself under-evidenced.

## Sources

- [Banister's TRIMP](https://www.trainingimpulse.com/banisters-trimp-0) · [Edwards'](https://www.trainingimpulse.com/edwards-trimp) · [Lucía's](https://www.trainingimpulse.com/lucias-trimp-0) · [iTRIMP](https://www.trainingimpulse.com/itrimp) — trainingimpulse.com
- [Bannister's TRIMP coefficients — intervals.icu forum](https://forum.intervals.icu/t/bannisters-trimp/10200)
- [TRIMP — Fellrnr](https://fellrnr.com/wiki/TRIMP)
- [GoldenCheetah Glossary — TRIMP(100) Points](https://github.com/GoldenCheetah/GoldenCheetah/wiki/UG_Glossary)
- [Training Stress Scores Explained — TrainingPeaks](https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained)
- [Running TSS (rTSS) Explained — TrainingPeaks](https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/)
- [What is Normalized Graded Pace? — TrainingPeaks](https://www.trainingpeaks.com/learn/articles/what-is-normalized-graded-pace/)
- [TSS vs hrTSS — TrainingPeaks](https://www.trainingpeaks.com/learn/articles/training-with-tss-vs-hrtss-whats-the-difference/)
- [HRSS = TRIMP / TRIMP@1h LTHR — TrainerRoad forum](https://www.trainerroad.com/forum/t/formula-to-calculate-hrtss/22982/3)
- [An Improved GAP Model — Strava Engineering](https://medium.com/strava-engineering/an-improved-gap-model-8b07ae8886c3)
- [Foster et al. 2001 — A new approach to monitoring exercise training](https://pubmed.ncbi.nlm.nih.gov/11708692/)
- [Haddad et al. 2017 — Session-RPE validity, Frontiers in Neuroscience](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full)
- [Sanders et al. 2017 — Methods of Monitoring Training Load, IJSPP](https://journals.humankinetics.com/view/journals/ijspp/12/5/article-p668.xml)
- [Passfield et al. 2022 — Validity of the Training-Load Concept, IJSPP](https://pubmed.ncbi.nlm.nih.gov/35247874/)
- [How does TrainingPeaks calculate my threshold?](https://help.trainingpeaks.com/hc/en-us/articles/204071774-How-does-TrainingPeaks-calculate-my-threshold)
- [Joe Friel — Determining your LTHR](https://joefrieltraining.com/determining-your-lthr/)
- [Threshold HR = 98% of peak 20-min — intervals.icu forum](https://forum.intervals.icu/t/threshold-heart-rate-calculation/35157)
- [Critical speed for runners — Running Writings](https://runningwritings.com/2024/01/critical-speed-guide-for-runners.html)
- [HRmax prediction equations in marathon runners — Frontiers in Physiology 2018](https://www.frontiersin.org/articles/10.3389/fphys.2018.00226/full)
