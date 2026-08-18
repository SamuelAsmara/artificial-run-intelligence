# Handoff: ARI — Artificial Run Intelligence (Athlete App)

## Overview
ARI is a data-driven running coach for distance runners. The athlete connects Strava, sets a goal race, and gets an adaptive 8–16-week plan; after every run the system recomputes physiological state (CTL/ATL/TSB, ACWR, cardiac drift, readiness) and explains its adjustments in plain language. This package covers the full app: auth + onboarding (Login), athlete Dashboard, Activity Detail, Plan, Activities history, Settings (working Strava connect flow), and a Coach dashboard. Two user roles: athlete and coach.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the target codebase (Next.js + Tailwind v4)** using its established patterns. Each `.dc.html` opens directly in a browser; the design markup lives between `<x-dc>…</x-dc>` and the logic/demo-data in the `<script data-dc-script>` block at the bottom. Ignore the `support.js` runtime — it is the prototype harness only. `{{ name }}` holes and `sc-for`/`sc-if` tags map 1:1 to JSX expressions, `.map()`, and conditional rendering.

## Fidelity
**High-fidelity.** Colors, typography, spacing, chart geometry, copy, and interaction states are final. Recreate pixel-perfectly; every color must come from the CSS custom properties listed under Design Tokens (they are identical in all five files and map directly to Tailwind v4 `@theme` variables).

## Hard constraints (from the product brief)
- Dark mode only. Exactly one accent color (blue). No emoji; icons are inline lucide SVG, stroke-width 1.5.
- All metric digits use `font-variant-numeric: tabular-nums` (class `.num`, IBM Plex Mono).
- **CSS logical properties only** (`padding-inline-start`, `margin-block-end`, `text-align: start/end`) — a Hebrew RTL version is planned.
- All user-facing strings live in one `COPY` object per screen (see each file's logic block) for a one-block translation pass.
- Charts are hand-authored SVG — no chart libraries.
- No localStorage/sessionStorage.

## Screens / Views

### 1. Dashboard — `ARI Dashboard.dc.html`
Purpose: the athlete's daily home. 1280px design width, 12-col grid (gap 12px), plus a 288px right rail (`.rail-grid`: `minmax(0,1fr) 288px`). Rail rows are grid-aligned with the main column rows (calendar↔hero, weekly volume↔metric tiles, race countdown↔PMC chart, recent activities↔plan+next session).
- **Top bar**: ARI wordmark (10px accent square + mono "ARI"), nav (Home · Activities · Plan · Settings) on the left; streak ("6 day streak", lucide flame) and greeting "Good morning, Samuel" / "Tuesday · Week 4 of 12 · Marathon" right-aligned.
- **Hero card**: left 260px column — circular 116px `image-slot` athlete photo (drop target; SVG smiley placeholder), readiness score (30px mono, color = status tone), status line "Ready to load / Ease off today / Rest day" + "Tuesday · Intervals 9.6 km". Right: AI COACH tag (accent-soft pill), narrative paragraph (16px/1.55), primary button "Get tomorrow's session", secondary "Show reasoning". Readiness thresholds: ≥70 Ready (positive), 40–69 Ease off (caution), <40 Rest day (negative).
- **Metric tiles** (4 × c3): value 30px mono + unit, name 12px muted, interpretation line 11px mono in semantic color. Cardiac Drift 2.4% "Low — good" (positive); Weekly Volume 42 km "+12% vs last week" (positive); ACWR 1.08 "Within safe range" (positive) — **at-risk state**: 1.62, negative color, card border negative; Form (TSB) derived from the chart series' final value.
- **Fitness · Fatigue · Form chart** (full width): 84 daily samples, smoothed cubic-bezier paths. CTL (--color-ctl, 2.4px) with vertical gradient fill (22%→0 opacity); ATL (--color-atl, 1.4px); TSB (--color-tsb, dashed 5 4) + ±area at 6% opacity. End-of-line value labels (48 / 43 / +5, collision-nudged 13px apart). Hover: dashed crosshair, dots on each series, tooltip (date · Fitness/Fatigue/Form values). History window ends today (Aug 11).
- **Training plan (week strip)**: ‹ › week pager ("Week 4 of 12 · Aug 9 – 15"), legend (blue Completed / orange Planned / red Missed). 7 day cards (Sun–Sat, min-height 102px): day+date, status (DONE/MISSED/TODAY/ADJ), session name, distance, intensity tag. Today: elevated bg + accent border; Adjusted: caution border. Click a day → detail panel: title, meta, segmented structure bar (blue if completed, orange if planned, line-strong if missed), caption.
- **Next session card** (full width): "Next session · Intervals — 6 × 800 m", "Today · 9.6 km · ~49 min", Adjusted tag + caution reason line. Segmented bar: WU 10 min (h24, --color-atl) → 6 reps 3.4 min (h52, accent) with 90 s jogs (h12, line-strong) → CD 10 min; widths proportional to duration. Below divider: tomorrow's easy run as a single flat 22px segment ("6 km @ 5:30 — steady").
- **Right rail** (top→bottom): **Month calendar** (‹ August 2026 ›, S–S grid, 4px dots: blue done / orange planned / red missed; today = accent-filled cell; race day Oct 11 = accent-soft cell), legend row. **Weekly volume** — 12 bars (build→recover→peak→taper: 51,54,38,62,…74 peak,…34 taper), past = accent, current = caution, future = outlined elevated; "▲ Week 4" marker. **Race countdown** — "61 days" / "to race day · Marathon · Oct 11, 2026", plan progress bar 33%, Target 3:45:00 vs Predicted 3:47:10 (caution). **Recent activities** — 9 compact rows: date, km, pace, 56×20 pace sparkline (caution color = faded run); row links to Activity Detail.
- **Personal Records strip** (page-bottom, full width): gold treatment — 1px gold border, 2px gold top border, vertical gradient from --color-gold-soft, gold trophy icon + centered "Personal Records" title. 4 centered cells with 1px dividers: 5K 21:48, 10K 47:12 ("NEW PB" in gold), Half 1:47:20, Marathon 3:52:11 ("GOAL 3:45" caution).
- **Ask ARI chat drawer**: fixed pill button (bottom-inline-end); 380px fixed side drawer — header (AI COACH tag + "Coach chat" + close), message list (user = accent bubble/accent-ink text, coach = elevated bubble), input + Send. Demo: sending appends the message and a canned coach reply after ~600ms.

### 2. Activity Detail — `ARI Activity Detail.dc.html`
- **Header card**: "Wednesday Easy Run", date, EASY RUN tag; summary row: 6.21 km · 33:31 · 5:24/km · 148 bpm · 64 m elevation (24px mono values).
- **Planned vs actual**: Planned "Easy run, 6 km @ 5:30/km" vs Actual "6.2 km @ 5:24/km"; state chip On target (positive) / Too fast / Below target (caution) with one-line explanation. "Too fast on an easy day" is a caution, not a win.
- **Main chart** (1180×300 viewBox): X = distance (km) with Distance/Time segmented toggle; pace line (accent, **inverted axis — faster is up**, axis label "min/km ↑ faster"); heart rate on right axis (--color-tsb, bpm 100–185); elevation as recessive filled area (elevated fill, line-strong stroke). Legend chips toggle each series on/off (off = 0.38 opacity). Hover: crosshair + dots + tooltip (distance · time, pace, HR, elevation — active series only). Demo data: ~205 samples @10s, noisy, HR lags pace ~25s, second-half fade.
- **Splits**: horizontal bars per km, length ∝ speed, pace printed; fastest km = accent, slowest = caution. Analysis line: "Your last 2 km were 18 s/km slower — that's the cardiac drift showing up."
- **AI Coach card**: narrative + "Show reasoning" secondary button.

### 3. Plan — `ARI Plan.dc.html`
- **Stats strip**: 12 weeks · 4 completed, 660 km total, 74 km peak (W9), 61 days to race.
- **Month sections** (JULY 2026 → OCTOBER 2026, mono uppercase headers) of collapsible **week rows**: Week n, date range, phase tag (Base/Build/Recovery/Peak/Sharpen/Taper — Build/Sharpen accent, Recovery/Taper positive, Peak caution), weekly km, status (DONE/CURRENT). Current week: accent-soft border, open by default.
- Expanding a week shows its 7 **day cards** (same vocabulary as dashboard); clicking a day opens **full workout detail**: title, "9.6 km @ 4:15/km · ~47 min", status tag, segmented structure bar with WU/reps/CD labels, purpose paragraph per type (aerobic maintenance / threshold / VO2max / long endurance / rest), and adjustment reason when status = Adjusted.
- **Race day strip**: RACE DAY tag · "Sun Oct 11, 2026 · Marathon · 42.2 km" · "Target 3:45:00 · 5:20/km".

### 4. Activities — `ARI Activities.dc.html`
- **Stats strip**: 18 runs, 141 km, 5:28/km avg pace, 151 bpm avg HR, 10K PB 47:12.
- **Weekly distance** bar card (W1–W4, current week dimmed "so far") and **Easy-run pace trend** line card (weekly averages, improving; "faster ↑").
- **All runs table**: filter chips (All/Easy/Tempo/Intervals/Long — active = accent fill); columns Date · Session (type dot: easy positive, tempo caution, intervals accent, long atl) · Dist · Time · Pace · Avg HR · pace-shape sparkline. Rows hover-elevate and link to Activity Detail.

### 5. Settings — `ARI Settings.dc.html` (1080px container)
- **Personal details card**: Full name (text), Age + Weight kg (number, 2-col), Running level segmented control (Beginner/Intermediate/Advanced), "Save changes" + transient "Saved" confirmation.
- **Connectivity card**: Strava row (orange #fc4c02 34px "S" square) + Garmin Connect / Suunto / Apple Watch / Runkeeper rows with "Coming soon" tags.
- **Strava flow (must work end-to-end)**: Connect → modal overlay (dimmed scrim, authorize card: Strava mark, "Authorize ARI", scope list — activities & streams / public profile / auto-sync, revoke note, Cancel/Authorize) → "Connecting…" (~1.1s token exchange) → Connected state: positive border + CONNECTED tag, Account "Samuel C. · #48291077", Last sync, Auto-sync toggle (38×21 pill switch), "Sync now" (shows "Syncing…" ~0.9s then "Just now · up to date"), Disconnect (returns to initial state). In production: Strava OAuth2 (`read,activity:read_all`), webhook-driven ingest into `activities` + `activity_streams`.

## Interactions & Behavior
- Nav links connect all five screens; activity rows open Activity Detail.
- Hover states: cards/rows `background: var(--color-elevated)`; buttons brighten (primary) or strengthen border (secondary).
- Transitions: keep minimal and instant; the toggle knob animates `inset-inline-start .15s`. No confetti, no gamification.
- Responsive: single breakpoint ~700px (860px Settings) — nav hides (add a mobile menu in production), rail stacks under main column, metric tiles and PB strip go 2×2, tables drop secondary columns (`.hide-m`), week rows compress.
- Charts must downsample gracefully (3 km–30 km runs; 200–400 stream samples).

## State Management
- Dashboard: `weekView` (0–11), `selD` (selected day), `calMonth` (6–9), `pmcHi` (chart hover), chat (`chatOpen`, `msgs`, `chatInput`). Tweakable demo props: `readinessScore` (0–100), `acwrRisk` (bool).
- Activity Detail: `xMode` (dist/time), `hi` (hover index), `showPace/showHr/showElev`; prop `paceState` (ontarget/toofast/tooslow).
- Plan: `openWeek`, `selDay`. Activities: `filter`. Settings: profile fields, `strava` (off/connecting/on), `authOpen`, `autoSync`, `syncing`, `lastSync`.
- Data comes from these DB tables (do not invent fields): `readiness_snapshots` (date, ctl, atl, tsb, acwr, cardiac_drift, readiness_score, narrative), `plan_workouts` (week_number, day_date, workout_type easy|interval|long|rest, planned_distance, planned_pace, status planned|completed|missed|adjusted), `activities` (distance_m, duration_s, avg_hr, avg_pace, started_at), `activity_streams` (activity_id + parallel arrays distance[], velocity[], heartrate[], altitude[], time[] @~10s), `goal_races` (race_type, race_date, target_time), `plan_adjustments` (reason_code, reason_text, before, after).

## Design Tokens (identical `:root` in all files)
```css
--color-canvas:#0a0c10; --color-surface:#12151b; --color-elevated:#1b1f27;
--color-ink:#e9edf3; --color-muted:#a4aebe; --color-faint:#8792a3;
--color-line:#242a34; --color-line-strong:#364050;
--color-accent:#4e8ef7; --color-accent-ink:#061225; --color-accent-soft:#14243d;
--color-positive:#7fc887; --color-caution:#e0a33c; --color-negative:#f0705c;
--color-ctl:#4e8ef7; --color-atl:#d8dee8; --color-tsb:#a9a094;
--color-gold:#d8b45f; --color-gold-soft:#2a2210;   /* PB strip only */
--color-strava:#fc4c02;                             /* Settings only */
/* Coach/Login reuse the same block verbatim */
--radius-card:14px; --radius-control:8px; --radius-pill:999px;
```
- Typography: IBM Plex Sans 400/500/600 (UI), IBM Plex Mono 400/500 (all numbers, tags, axis labels; tabular-nums). Body 14px/1.45. Card titles 13–14px/600. Metric values 20–30px mono.
- Spacing: page gap 12px; card padding 20px 22px (main) / 14px 16px (rail); grid gap 12px.
- Core primitives → React components 1:1: `.card`, `.btn` (+`.btn-primary`/`.btn-secondary`), `.tag`, `.num`.
- Contrast: muted/faint meet 4.5:1 on surface/elevated; chart series differ in lightness + TSB is dashed (dichromacy-safe).

## Assets
- Google Fonts: IBM Plex Sans, IBM Plex Mono (only external dependency).
- Icons: inline lucide paths (flame, trophy, chevrons, message-circle, x), stroke-width 1.5.
- Athlete photo: user-droppable slot; prototype ships an inline SVG smiley placeholder (replace with avatar upload in production).

### 6. Login / Onboarding — `ARI Login.dc.html`
Three internal views driven by state:
- **Auth**: centered card, Log in / Sign up segmented tabs. Sign-up adds Username and a role picker (Athlete = "Train with an adaptive plan" / Coach = "Manage a roster of athletes"). Validation: username required (signup), valid email, password >= 6 chars; inline error line in --color-negative. Coach signup ends in a "Welcome, Coach" card linking to the coach dashboard.
- **Empty dashboard** (athlete, no data): same chrome as the real dashboard but every module in its zero state — dashed readiness circle with "--", metric tiles showing "--" + "No data yet", empty chart placeholder card, and an AI Coach welcome narrative with two CTAs: **"Build my training plan"** and **"I have a coach code"**. This zero-state pattern applies to all athlete screens on first run.
- **Build plan modal**: goal race (5K/10K/Half/Marathon, target time auto-defaults per race: 22:00 / 47:00 / 1:45:00 / 3:45:00), race date, training days per week (3-6), "Generate plan" -> ~1.3s generating state -> success banner with "Open dashboard".
- **Coach code modal**: fake QR (SVG) + code input (ARI-XXXX). "Join plan" -> verifying/syncing -> success ("Connected to Coach Dana - Marathon plan - 12 weeks"; plan downloaded, coach gains access to the athlete's data) -> "Open dashboard". In production this is a signed short-lived token that links athlete->coach and copies the plan into plan_workouts.

### 7. Coach dashboard — `ARI Coach.dc.html`
- Header: ARI wordmark + COACH tag; nav Athletes/Plans/Settings; "Share plan code" primary button; greeting.
- **Stats strip**: athletes on roster, at injury risk (ACWR > 1.5, negative color), workouts completed this week, races in next 30 days.
- **Needs attention** feed: injury-risk alerts (ACWR spikes, low readiness), final-weeks/taper reminders, race-in-N-days confirmations, new-athlete-without-plan; each row links to that athlete's data (severity edge + dot).
- **Fitness comparison**: multi-line CTL chart (12 weekly points) for the marathon group; legend chips toggle athletes on/off; end-of-line initials.
- **Upcoming races**: next-90-days list (date, athlete(s), race tag, "in N d"); nearest race highlighted (elevated bg + accent edge).
- **Messages**: two-pane message center — thread list (unread accent dot, selected = elevated) + conversation pane (coach bubbles = accent, athlete = elevated) with input; "View athlete ->" link in the thread header.
- **Roster table**: profile photo slot (32px circle image-slot per athlete, initials as placeholder), name + gender/age, level tag, race + race day, readiness (colored by threshold), ACWR (negative > 1.5, caution > 1.3), weekly km, status (On track / Watch / At risk / New). Filters: gender, level, race distance (chip groups). Rows link to the athlete dashboard **with ?coach=1**.
- **Share plan modal**: plan picker (Marathon 12wk / Half 10wk / 10K 8wk), per-plan code (e.g. ARI-7F3K-9Q) + QR, Copy code, expiry note (7 days).

### Coach view of athlete screens
Athlete Dashboard and Activity Detail read `?coach=1` from the URL and show a "Coach view" banner (accent-soft bar: "You are viewing Samuel Cohen's data", Adjust workout / Back to roster). Activity Detail additionally renders a **planned-pace band** on the main chart (shaded window 5:30 +-10s + dashed PLAN line) and a "vs plan +N s/km" row in the hover tooltip — this is how a coach spots plan-vs-execution gaps.

### Settings additions (since v1)
Profile photo slot (72px circle, drag/click), Email moved to a dedicated **Account & security** card (Update email + confirmation note; Change password: current + new >= 6 chars, inline validation, success note), Bio ("About", 160-char counter), Height/Age/Weight row, **Training for** race picker + Target time with computed "Required pace" (target seconds / race km).

## Files
- `ARI Login.dc.html` — auth, role pick, empty states, build-plan + coach-code flows
- `ARI Dashboard.dc.html` — athlete dashboard (home); supports ?coach=1
- `ARI Activity Detail.dc.html` — single-run analysis + planned-pace band; supports ?coach=1
- `ARI Plan.dc.html` — 12-week marathon plan
- `ARI Activities.dc.html` — run history + trends
- `ARI Settings.dc.html` — profile, account & security, connectivity (Strava flow)
- `ARI Coach.dc.html` — coach dashboard (roster, alerts, comparison, races, messages)
- `screenshots/` — desktop captures of the main screens
- `image-slot.js`, `support.js` — prototype harness only; do not port
