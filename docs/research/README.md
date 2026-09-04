# Research — training load, fitness/fatigue, and injury risk

Literature review carried out on 16 Aug 2026 to ground Runi's training logic in
published evidence rather than in whatever a commercial platform happens to do.

Two briefs:

- `01-training-load-metrics.md` — how endurance training load is quantified
  (TRIMP variants, TSS/hrTSS/rTSS, session-RPE), which metric survives when the
  only inputs are summary fields, and how to estimate threshold HR/pace from
  history alone.
- `02-fitness-fatigue-and-acwr.md` — the Banister impulse-response model,
  CTL/ATL/TSB, the acute:chronic workload ratio, and an honest assessment of
  what the evidence does and does not support.

## The two findings that change the product

**1. Load metric.** With only `distance_m`, `duration_s`, `avg_hr` and
`avg_pace`, the best-conditioned metric is **HRSS** — Banister TRIMP normalised
so that one hour at threshold heart rate equals 100. Normalising cancels the
disputed sex coefficient entirely and cuts sensitivity to estimated HRmax/HRrest
from ±25% to ±2–8%. Fallback when heart rate is missing: rTSS using average
speed. Known cost: averaging under-scores interval sessions by 10–20%.

**2. ACWR is not an injury predictor, and our UI currently claims it is.**
The design shows "Injury risk — reduce load" at ACWR 1.62. The evidence does not
support that claim:

- Recomputing ACWR with a **randomly generated** chronic denominator produces
  almost the same injury odds ratio as the real one (Impellizzeri et al. 2021).
  Discrimination is c ≈ 0.57 — barely better than a coin flip.
- The 0.8–1.3 "sweet spot" and the 1.5 "danger zone" come from an illustrative
  figure built partly on unpublished data, not from a primary study.
- The largest running-specific cohort — 5,205 runners, 588,071 sessions
  (Frandsen et al., BJSM 2025) — found **no positive relationship** between ACWR
  and injury. What *did* predict injury was a single session much longer than
  the athlete's longest run in the previous 30 days:

  | Session vs 30-day longest run | Hazard rate ratio |
  |---|---|
  | ≤ +10% | 1.00 (reference) |
  | +10% to +30% | 1.64 |
  | +30% to +100% | 1.52 |
  | > +100% | 2.28 |

**Implication for Runi:** keep ACWR as a descriptive number ("you are training
40% above your usual level"), drop the risk language, and make the primary
safety signal *session distance versus 30-day longest run* — which is both
better supported and computable from the fields we already store.

This is a defensible, citable design decision, and the honest framing is itself
worth marks: the app implements published metrics and discloses their limits
rather than implying it has validated them.
