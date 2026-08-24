# Design port — progress

The full Claude Design handoff (11 boards) landed 24 Aug 2026. This file tracks
what has been ported into the app and what has not, so any session can pick the
work up without re-reading everything.

**Source of truth:** `_archive/design_handoff_2026-08-24_full/` — every board,
plus `uploads/` for the image assets. `support.js` and `image-slot.js` are the
prototype harness and must never be ported.

**Gate before every delivery:** `npx tsc --noEmit` · `npm test` · `npx next build`,
plus a render of the changed screen through the harness in `/tmp/harness`.

---

## The port is complete

Every board that was delivered has been ported, and the two deliverables the
handoff never returned — the calendar module and the mode toggle — were built
from the brief.

### Global

- [x] **`.card`** gradient surface, inset top highlight, drop shadow, accent
      glow on hover. Cards that paint their own ground (the gold records band,
      the coach-view banner) are excluded so the gradient does not flatten them.
- [x] **`layout.tsx`** two low radial accent washes and a 2px hairline across
      the top of the viewport. Fixed, inert, behind everything.

### The kit — `components/ui/`, rules in `lib/ui/`

- [x] **`StatTile`** — direction A (IBM Plex Mono, 25px, −0.02em over an 8.5px
      uppercase label). `STAT_ICONS` is the icon set. A bad reading is the only
      state allowed to colour the figure itself; every other state colours only
      the interpretation line. `value: null` renders an em dash, never a zero.
- [x] **`MiniBars`** + `lib/ui/miniBars.ts` (20 tests) — bar width follows the
      spacing (`0.34 × step`, clamped 9–30) so four weeks read as columns and
      twelve stay hairlines. The in-progress period is outlined, never filled,
      and is never counted as the best week even when its figure is highest.
- [x] **`DayCell` / `DayCellFull`** + `lib/ui/dayCell.ts` (8 tests) — every
      state, and `SESSION_EDGE` as the one place session-type colour is decided.
- [x] **`FilterChip` / `ActionChip` / `StatusChip`** — three jobs, three
      treatments, so an armed action can never read as an active filter.
- [x] **`SectionHeader`**, **`RaceCountdown`**, **`EmptyState`**.
- [x] **`lib/ui/monthGrid.ts`** (13 tests) — a month as seven Monday-first
      columns. Dates are handled as strings; parsing to a `Date` and reading
      `getMonth()` back is how a plan built in one timezone shows a Sunday
      session on the previous Saturday.

### Screens

- [x] **Dashboard** — metric strip inside the hero card spanning both columns;
      fitness chart 148 tall with a glow under the CTL line; next session as a
      stepped pace line (`lib/dashboard/sessionLine.ts`); weekly volume on the
      kit's bar chart; week strip on the kit's day cell; race countdown at 42px
      with −0.03em tracking.
- [x] **Activities** — stats row on `StatTile`; weekly distance on `MiniBars`;
      filters on `FilterChip` and Compare / Auto-pick on `ActionChip`.
- [x] **Plan** — stats row on `StatTile`; day cells from the kit; a **Weeks /
      Month** toggle, the month view built on `monthGrid` and `DayCellFull`.
- [x] **Activity Detail** — five stacked lanes with per-lane Y titles and
      ranges, the dragged selection as its own row beneath the chart.
- [x] **Settings** — provider tiles select with an inset ring and a soft ground
      rather than an underline; confirm fields on email and password.
- [x] **Coach** — summary rows on `StatTile` (the colour the caller computes
      becomes a *tone*, not paint on the figure); calendar zoom on `FilterChip`;
      month and week cells ring inset instead of bordered; empty states on
      `EmptyState`.
- [x] **Login** — full-bleed hero with the brand-blue overlay, blurred twin
      underneath, glass card. Assets in `public/login/` (`hero.webp` 80 KB,
      `hero.jpg` 183 KB).
- [x] **Mode toggle** — `components/coach/CoachModeBar.tsx`. One segmented
      control instead of two rows of tabs, the accent carrying the active mode
      and a sentence beside it naming whose numbers are on screen. The coach's
      sections appear only while coach mode is the active one.

---

## Rules for this port

**Use the kit.** Anything in `components/ui/` is the shared version. A screen
that needs a stat, a bar chart, a day cell, a chip, a section header or an empty
state imports it rather than re-styling one.

**Phase 1 wins over the handoff.** The boards were designed before 24 Aug, so
they still show the old state in several places.

**Never show a figure the data cannot support.** `StatTile` takes `null` and
draws an em dash. A zero is a claim; an em dash is the truth.

**Selection never moves anything.** Inset rings, never outer borders.

---

## Render harness

`/tmp/harness` holds `live.html` (the `@theme` block from `globals.css` turned
into `:root`) and `shot.js`. To render a screen:

```
cd <repo> && cat > _entry.tsx <<'X'
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { PlanView } from "@/components/screens/PlanView";
createRoot(document.getElementById("root")!).render(createElement(PlanView, {}));
X
npx esbuild ./_entry.tsx --bundle --outfile=/tmp/harness/client.js --alias:@=./src \
  --alias:@/components/plan/BuildPlanCard=/tmp/harness/stub/BuildPlanCard.tsx \
  --jsx=automatic --define:process.env.NODE_ENV='"production"' --minify
node /tmp/harness/shot.js
```

Two traps. **The entry file must live inside the repo** — from outside it,
`react-dom/client` resolves to a globally installed React while `@/components`
resolves to the local one, two copies, and every hook throws `Cannot read
properties of null`. And **any screen importing a server action pulls Next's
server bundle in**; alias that module to a stub, as above.
