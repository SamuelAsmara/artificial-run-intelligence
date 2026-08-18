# Brief 2 — Fitness/fatigue modelling and injury-risk signals

## 1. The Banister impulse-response model

Performance is a baseline plus a slow-decaying positive "fitness" trace and a fast-decaying
negative "fatigue" trace, both driven by the same training impulse.

```
g(t) = g(t−1) · e^(−1/τ₁) + w(t)          // fitness
h(t) = h(t−1) · e^(−1/τ₂) + w(t)          // fatigue
p(t) = p₀ + k₁·g(t) − k₂·h(t)             // modelled performance
```

Reported parameters:

| Source | τ₁ (fitness, d) | τ₂ (fatigue, d) | k₁ | k₂ |
|---|---|---|---|---|
| Classic (Hellard 2006) | 45 | 15 | 1.0 | 2.0 |
| Elite swimmers, measured | 38 ± 16 | 19 ± 11 | — | — |
| Range across studies | 35–51 | 8–13 | — | — |
| TrainingPeaks defaults | 42 | 7 | 1 | 1 |

## 2. CTL / ATL / TSB — what we implement

TrainingPeaks' Performance Manager is Banister with three simplifications:
it **normalises** (multiplies the impulse by `1 − e^(−1/τ)`) so the series converges to a mean
daily load; it sets **k₁ = k₂ = 1**; and it uses **τ₂ = 7**, shorter than most fitted values.

```
α_τ  = 1 − e^(−1/τ)
X(t) = X(t−1) + (L(t) − X(t−1)) · α_τ
```

| | exact `1 − e^(−1/τ)` | TrainingPeaks' published `1/τ` | difference |
|---|---|---|---|
| CTL (τ=42) | 0.0235283 | 0.0238095 | 1.2% |
| ATL (τ=7) | 0.1331222 | 0.1428571 | **7.3%** |

We use the exact form and document that TrainingPeaks publishes the approximation.

**TSB uses yesterday's values** — `TSB(t) = CTL(t−1) − ATL(t−1)`. It describes readiness at the
*start* of today; using same-day values makes every hard session instantly tank Form, which is
behaviourally wrong.

```ts
const decay = (tau: number) => Math.exp(-1 / tau);
const alpha = (tau: number) => 1 - Math.exp(-1 / tau);
const CTL_TAU = 42, ATL_TAU = 7;

/**
 * `series` MUST be gap-filled — one entry per calendar day, load 0 on rest days.
 * Omitting rest days is the classic bug: CTL then decays only on training days
 * and inflates indefinitely.
 */
export function computePmc(series: { date: string; load: number }[], seedCtl = 0, seedAtl = 0) {
  const aC = alpha(CTL_TAU), dC = decay(CTL_TAU);
  const aA = alpha(ATL_TAU), dA = decay(ATL_TAU);
  let ctl = seedCtl, atl = seedAtl;
  const out = [];
  for (const { date, load } of series) {
    const tsb = ctl - atl;                    // yesterday's, before today's load
    ctl = ctl * dC + load * aC;
    atl = atl * dA + load * aA;
    const ctl7ago = out.length >= 7 ? out[out.length - 7].ctl : seedCtl;
    out.push({ date, ctl, atl, tsb, rampRate: ctl - ctl7ago });
  }
  return out;
}
```

**Cold start:** CTL needs ~3τ = 126 days to settle. Either seed from mean daily load, or start
from zero and show "building your baseline — N more days". Never present a ramping-from-zero CTL
as real fitness gain.

### Interpretation bands — and their status

TSB zones (Joe Friel): `< −30` high risk · `−30..−10` optimal training · `−10..+5` grey zone ·
`+5..+25` race freshness · `> +25` detrained.
CTL ramp rate: 5–8 points/week "about right"; >10 is overreaching territory.

> ⚠️ **These are coach heuristics, not research findings.** No trial establishes that TSB < −30
> causes injury or that 5–8 CTL/week is safer than 9. Cite them as expert opinion.

Also note CTL is **scale-dependent** — a beginner at CTL 25 and an elite at CTL 110 both at
TSB −25 are in different physiological situations. Absolute ramp advice is harsher on beginners
than elites, arguably backwards.

**TSB is not "predicted performance."** Setting k₁ = k₂ = 1 contradicts essentially every fitted
Banister parameter set (k₂ > k₁). It is a balance indicator. Do not claim more.

## 3. ACWR

```
acute(t)   = mean daily load over [t−6 .. t]
chronic(t) = mean daily load over [t−27 .. t]        // coupled
ACWR(t)    = acute / chronic
```

EWMA variant (Williams 2017): `λ = 2/(N+1)` → `λ_acute = 0.25`, `λ_chronic = 0.0690`.

> ⚠️ `λ = 2/(N+1)` is the finance EMA convention — **not** the `1 − e^(−1/N)` used for CTL/ATL.
> For N=7: 0.25 vs 0.1331. EWMA-ACWR has roughly **half** the memory of ATL at the same nominal N.
> If the app shows both an ACWR and a TSB, they run on different clocks. Harmonise or disclose.

**Zero-denominator handling:** a runner returning from two weeks off has chronic ≈ 0 and ACWR
explodes. Return `null` and show "not enough recent history", never a red warning.

## 4. The evidence — and why we are changing the UI

| Claim | Status |
|---|---|
| Rapid load increases are associated with overuse injury | **Reasonably supported** |
| ACWR is a valid *predictor* of injury | **Not supported** — c ≈ 0.57 |
| 0.8–1.3 is a protective "sweet spot" | **Not supported** — illustrative figure, unpublished data |
| ACWR ≥ 1.5 is a "danger zone" | **Not supported** — no primary study used 1.5 |
| Manipulating ACWR reduces injuries | **No evidence** — no intervention trial exists |
| Coupling invalidates ACWR | **Overstated** — real but small (r = 0.88–0.99 coupled vs uncoupled) |

**The randomisation test (Impellizzeri et al. 2021, *Sports Medicine*).** Recomputing ACWR with
the real chronic denominator replaced by random numbers:

| Denominator | Odds ratio for injury |
|---|---|
| Real chronic load | 2.45 (1.28–4.71) |
| Fixed constant | 1.95 |
| **Random numbers** | **1.16–2.07 (mean 1.89)** |

ACWR's apparent association with injury is essentially the association of **acute load** with
injury, rescaled. Their title: *"Time to Dismiss ACWR and Its Underlying Theory."*

**The running-specific study that matters most.** Frandsen et al., *BJSM* 2025 — 5,205 runners,
588,071 Garmin sessions, 18 months, 1,820 overuse injuries. Three exposures compared head to head:

1. **Session distance vs longest run in previous 30 days** — significant:

   | Band | Hazard rate ratio |
   |---|---|
   | ≤ +10% | 1.00 (reference) |
   | +10% to +30% | **1.64** (1.31–2.05) |
   | +30% to +100% | **1.52** (1.16–2.00) |
   | > +100% | **2.28** (1.50–3.48) |

2. **ACWR (1 week vs preceding 3)** — a **negative** dose-response. Higher ACWR, *lower* injury rate.
3. **Week-to-week ratio** — no relationship.

Caveats to state: observational, self-reported injury, non-monotonic in the middle bands, and the
negative ACWR gradient plausibly reflects reverse causation (people already hurting run less).

**The 10% rule.** Buist et al. 2008 — an RCT with 532 novice runners comparing a 13-week graded
programme built on the 10% rule against a standard 8-week programme: injury incidence **20.8% vs
20.3%, p = 0.90**. A null RCT, and the highest-quality evidence in the area. "Don't increase a lot,
quickly" survives; "exactly ≤10% per week" does not.

## 5. What ARI should do

**Metric hierarchy:**

| Tier | Metric | Rationale |
|---|---|---|
| Primary | Session distance vs **30-day longest run**, banded ≤10 / 10–30 / 30–100 / >100% | Only metric with large running-specific prospective support; actionable *before* the run |
| Primary | Absolute weekly volume and absolute week-on-week change | Scale-honest, no ratio pathology, no denominator blow-up |
| Secondary | CTL / ATL / TSB (42/7) | Good for training-state narrative and taper planning — **not** injury risk |
| Secondary | CTL ramp rate, 5–8/week guide | Labelled as coaching heuristic |
| Tertiary | ACWR, continuous value only | Familiar to users; no colour-coded risk zones |

**Presentation rules:**

- Show ACWR as a **continuous number with a trend**, not a traffic light. Discretisation is a
  documented source of false discovery — don't reproduce it in the UI.
- Use descriptive language: *"You're training 40% above your usual 4-week level"* — never
  *"Injury risk: HIGH"*.
- Suppress when the denominator is unreliable (<4 weeks of data, or after a layoff).
- Add a "how is this calculated / how good is this metric?" panel stating plainly that ACWR has
  not been shown to predict injury.
- Never display an injury probability. Never gate or block a workout on ACWR. Never let a
  deliberate taper trigger an alert — that is a documented EWMA failure mode.

**Suggested in-app copy:**

> **How we calculate this.** Acute load is a 7-day exponentially-weighted average of your daily
> training load; chronic load is a 28-day one. The ratio describes how your last week compares
> with your recent norm.
>
> **What it does and doesn't tell you.** This describes your training pattern. It does **not**
> predict injury. The ratio performs about as well with a randomly-generated denominator as with
> your real history (Impellizzeri et al., *Sports Medicine*, 2021), and the largest study of
> runners to date (5,205 runners, *BJSM* 2025) found no positive relationship between it and
> injury. The commonly-cited "safe zone" of 0.8–1.3 comes from an illustrative diagram.
>
> **What we'd pay more attention to.** How much longer today's run is than your longest run in the
> last month.

## 6. Threats to validity, for the project write-up

1. We implement metrics whose construct validity is contested, chosen for interpretability and
   user familiarity, and we disclose their limits in-product.
2. Our load unit is itself an approximation; the Banister family assumes load is one-dimensional.
3. CTL/ATL/TSB set k₁ = k₂ = 1, contradicting fitted Banister parameters — TSB is a balance
   indicator, not a performance prediction.
4. τ = 42/7 are platform defaults, not individually fitted; fitted values scatter widely and
   Hellard et al. found them statistically ill-conditioned.
5. **We have no injury outcome data, so we validate nothing.** We implement published metrics; we
   do not test them. State this explicitly rather than implying validation.

## Sources

- [The Science of the Performance Manager — TrainingPeaks](https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/)
- [Hellard et al. — Limitations of the Banister model (PMC1974899)](https://pmc.ncbi.nlm.nih.gov/articles/PMC1974899/)
- [Fitness (CTL) — TrainingPeaks Help](https://help.trainingpeaks.com/hc/en-us/articles/204071884-Fitness-CTL)
- [What is the Performance Management Chart? — TrainingPeaks](https://www.trainingpeaks.com/learn/articles/what-is-the-performance-management-chart/)
- [Managing Training Using TSB — Joe Friel](https://joefrieltraining.com/managing-training-using-tsb/)
- [The CTL Ramp Rate — Joe Friel](https://joefrieltraining.com/the-ctl-ramp-rate/)
- [Gabbett 2016 — The training-injury prevention paradox, BJSM](https://doi.org/10.1136/bjsports-2015-095788)
- [Hulin et al. 2014 — Spikes in acute workload, cricket, BJSM](https://doi.org/10.1136/bjsports-2013-092524)
- [Hulin et al. 2015 — ACWR predicts injury, rugby league, BJSM](https://doi.org/10.1136/bjsports-2015-094817)
- [Williams et al. 2017 — EWMA vs rolling averages, BJSM](https://pubmed.ncbi.nlm.nih.gov/28003238/)
- [Impellizzeri et al. 2020 — Conceptual Issues and Fundamental Pitfalls, IJSPP](https://doi.org/10.1123/ijspp.2019-0864)
- [Impellizzeri et al. 2021 — Time to Dismiss ACWR, Sports Medicine](https://link.springer.com/article/10.1007/s40279-020-01378-6)
- [Wang et al. 2020 — Lessons Learned from the ACWR, Sports Medicine](https://link.springer.com/article/10.1007/s40279-020-01280-1)
- [Lolli et al. 2017 — Mathematical coupling, BJSM](https://doi.org/10.1136/bjsports-2017-098110)
- [Gabbett et al. 2019 — To Couple or not to Couple? IJSM](https://gabbettperformance.com.au/wp-content/uploads/2019/07/Gabbett-et-al_2019_To-Couple-or-not-to-Couple_For-ACWR-and-Injury-Risk-Does-it-Really-Matter_IJSM-1.pdf)
- [Maupin et al. 2020 — Systematic review, OAJSM](https://www.dovepress.com/the-relationship-between-acute-chronic-workload-ratios-and-injury-risk-peer-reviewed-fulltext-article-OAJSM)
- [Qin, Li & Chen 2025 — Meta-analysis, BMC Sports Sci Med Rehabil](https://link.springer.com/article/10.1186/s13102-025-01332-x)
- [Frandsen et al. 2025 — How much running is too much? BJSM 59(17):1203–1210](https://pure.au.dk/portal/en/publications/how-much-running-is-too-much-identifying-high-risk-running-sessio/)
- [Buist et al. 2008 — No Effect of a Graded Training Program (RCT), AJSM](https://doi.org/10.1177/0363546507307505)
- [Nielsen et al. 2014 — Excessive Progression in Weekly Running Distance, JOSPT](https://doi.org/10.2519/jospt.2014.5164)
- [Damsted et al. 2018 — Changes in Weekly Running Distance, JOSPT](https://doi.org/10.2519/jospt.2019.8541)
