# UX round — Sami's list, 24 Aug 2026 — **closed**

All six items are done. Kept as a record of what changed and why.

## 1. Cycles — one row of tiles ✅

`CoachCyclesView.tsx` had **two** mechanisms doing one job: a grid of selector
cards that wrapped to three-then-one, and a separate stack of collapsible
sections. They are now one thing — a single horizontal row of tiles, and
clicking a tile opens that cycle's roster beneath it. The multi-select filter
and its "clear all" button are gone; the tiles are the control.

Each tile carries the race, the days remaining, the head count, and — the line
worth having on a closed tile — how many of those athletes need the coach today.

## 2. A coach can view a past session ✅

The past-edit guard had gone one step too far: past days opened nothing, which
took reading away along with writing. A past day now opens a **read-only**
planned-vs-actual card: what was asked for, what was run (distance, pace and
heart rate), and the gap. No fields, no Save.

`getAthleteDetail` now returns `actualHr`, averaged **by distance** rather than
by run — the mean of a 2 km jog at 120 and a 20 km long run at 155 is not 137.

The server guard in `updateWorkout` is unchanged.

## 3. One navigation row ✅

The mode bar no longer carries tabs of its own. It carries the toggle and the
sentence naming which mode you are in; the tabs for that mode live in the
screen's own header directly below. `CoachNav` also dropped its "My training"
link, which the toggle already does.

## 4. One settings page for a coach ✅

`/coach/settings` renders everything: preferences, thresholds, templates, join
code, **and** the profile card, the connections card, account security and the
methodology link. The "Account" button that sent a coach to `/settings` is gone.

`ProfileCard` and `ConnectionsCard` are exported from `SettingsView` and reused
as themselves — not copied — so the two pages cannot drift apart.

## 5. Formulas as typography ✅

`components/ui/Formula.tsx` — `Formula`, `Frac`, `Pow`, `V`, `N`, `Op`, `Where`.
Real fraction rules, raised exponents, dropped subscripts, italic variables and
upright numerals, all from the existing tokens. No LaTeX engine and no new
dependency.

`methodologyFormulas.tsx` holds the typeset version of each formula, keyed by
method id; a method with no entry falls back to its plain string. The page is
reachable from both the athlete's and the coach's settings.

## 6. The principle

Clarity before completeness. If a screen makes somebody ask "what am I looking
at" or "whose numbers are these", that is the bug, whatever else is on it.
