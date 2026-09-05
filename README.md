<div align="center">

# Runi — Run with Intelligence

**A training platform for runners and their coaches, where every decision is backed by the athlete's own data.**

[![Live](https://img.shields.io/badge/live-runi--coach.vercel.app-0a0a0a?style=flat-square)](https://runi-coach.vercel.app)
[![Repository](https://img.shields.io/badge/GitHub-SamuelAsmara%2Fartificial--run--intelligence-181717?style=flat-square&logo=github)](https://github.com/SamuelAsmara/artificial-run-intelligence)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-20232a?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Tests](https://img.shields.io/badge/tests-842%20passing-2bb3a3?style=flat-square)](#testing)

Final project · Internet Technologies · Reichman University · 2026

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [For the Athlete](#for-the-athlete)
  - [For the Coach](#for-the-coach)
- [Design Principles](#design-principles)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [For Reviewers](#for-reviewers)
- [Testing](#testing)
- [Documentation](#documentation)
- [Known Limitations](#known-limitations)

---

## Overview

Runi connects a runner's watch to their training. From that point on, the plan, the load, the recovery and the progress toward race day are all grounded in the athlete's own numbers rather than in a generic table.

The same engine serves the coach: one place that shows, every morning, which athletes need attention, which preparation cycle each one belongs to, and what week they are in.

- **Live app:** [runi-coach.vercel.app](https://runi-coach.vercel.app)
- **Repository:** [github.com/SamuelAsmara/artificial-run-intelligence](https://github.com/SamuelAsmara/artificial-run-intelligence) (`artificial-run-intelligence` is the project's original working name; the product is Runi)

---

## Features

### For the Athlete

**Home**
- Daily readiness score with the reasons behind it
- Four headline metrics: cardiac drift, weekly volume, load ratio and form (TSB)
- Fitness · Fatigue · Form chart (Performance Management Chart model)
- Countdown to race day with a Riegel-based finish-time prediction
- Personal records, each one linked to the run that set it

**Plan**
- Three ways to start, on one screen: a code from a coach, Runi's own plan, or a plan the athlete writes
- Runi's plan is built around the race date (base, build, peak, taper) and previewed before it is applied
- An adaptation engine that scales the coming week back when load spikes (ACWR) or when recent runs show high cardiac drift, restores it when the cause has passed, and writes the reason next to the session
- The athlete can leave a plan at any time; history is kept

**Your Numbers**
- One board with every metric the product computes: heart rate, pace, volume, recovery, training load, CTL / ATL / TSB, ACWR, readiness, grade-adjusted pace, drift and prediction
- Each metric shows its formula, the band the athlete is currently in, and a history over a week, a month, three months or a year
- If a number appears anywhere in the product, this is where it is explained

**Ask Runi**
- Ten fixed questions, available from every screen, each answered from the athlete's own data

### For the Coach

**Roster**
- Every athlete with a flag and a reason: load, prolonged silence, race approaching
- Filter by distance, then by cycle

**Preparation Cycles**
- Named groups of athletes preparing for the same race, e.g. *Tel Aviv Half* and *Jerusalem Half* side by side under the same distance
- Each athlete progresses through their own week of the cycle
- Add or remove athletes, edit name, date and template, and rebuild plans when the structure changes
- Closing a cycle closes the plans built from it; run history stays

**Templates**
- A plan structure per distance, from which cycles are created
- Editing a template never changes a running plan unless the coach explicitly asks to rebuild it

**Join Code**
- The coach hands the athlete a code; the athlete enters it in their own settings
- From that moment the coach sees the athlete's runs and plan; the athlete can leave at any time

**Packages**
- Athletes always use Runi for free; a coach picks a package under Settings → Billing
- Basic — free, up to five athletes; Premium — monthly subscription, unlimited athletes, free-text chat with Runi in the next version
- The Basic limit is enforced in the database when an athlete redeems a code; billing is a mockup — see [Known Limitations](#known-limitations)

---

## Design Principles

- **Every number is the athlete's own.** Nothing on screen is generic. Every metric is computed from that athlete's runs, sleep and heart-rate data.
- **Every number has a tested function behind it.** The physiological model, the planner and the adaptation engine are pure functions with unit tests.
- **Explain, do not just display.** Each metric comes with its formula and its current band; each adaptation comes with its reason.
- **Consent flows from the athlete.** A coach can read and plan only for athletes who entered the coach's code themselves.
- **No language model in the current version.** Ask Runi answers directly from the data. A future version will connect it to a model that phrases answers on top of the same calculations.

---

## Architecture

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Data & Auth | Supabase — Postgres with Row Level Security, Supabase Auth |
| Hosting | Vercel, with a nightly cron job for watch synchronisation |
| Validation | Zod at the external boundaries (webhook payload, race goal, a coach's session edits); explicit range checks inside every other Server Action |
| Testing | Vitest |

Three decisions shape most of the codebase:

- **Authorisation lives in the database.** Row Level Security on all 17 tables. An athlete reads only their own rows; a coach reads only the athletes who joined them. Relationships are created and moved only through narrow `SECURITY DEFINER` functions (`join_coach`, `set_athlete_cycle`), never through broad policies, and the identity columns of a profile (role, coach code, e-mail) cannot be changed by a client request.
- **Computation is separate from presentation.** The arithmetic — planning, readiness, load, metric history — lives in `lib/` as pure functions with no knowledge of React or the database, which is what makes the test suite fast and complete. A thin set of `lib/` modules (`readiness/recompute`, `providers/syncIcu`, `planning/runAdjustment`) reads and writes rows on behalf of the cron job and the actions.
- **One time zone for the whole product.** `Asia/Jerusalem` everywhere, so a run that ends at 23:50 stays on the day it was run.

---

## Project Structure

```
src/
├── app/            Pages, route handlers (cron, webhook, auth links), error and not-found pages
├── components/     Presentational components — receive data, never fetch it
├── actions/        Server Actions — the boundary between client and database (11 files, 47 actions)
├── lib/            Logic: planning, readiness, activity, insights, screens, time, validation
├── middleware.ts   Session guard for the protected routes
└── types/          Database types, kept by hand in step with the migrations
supabase/migrations/   24 numbered, backward-compatible migrations (0001 … 0024; two independent files share 0020)
scripts/               Engine check against real data, wellness check, demo data seeding
email/                 Branded auth e-mail templates and the Resend / Supabase setup
docs/                  Submission documents (1–10), presentation, audit notes and project log
```

---

## Getting Started

**Prerequisites:** Node 20+ and a Supabase project (the free tier is sufficient).

```bash
npm install
cp .env.example .env.local     # fill in the values — see Environment Variables below
npm run dev                    # http://localhost:3000
```

1. **Database.** Run every file in `supabase/migrations/` in numeric order in the Supabase SQL Editor (Dashboard → SQL Editor). The two files numbered `0020` are independent and can run in either order.
2. **Auth.** In Supabase → Authentication, keep e-mail sign-in on. `email/README.md` has the SMTP settings for Resend and the branded templates.
3. **Demo data (optional).** Set `DEMO_PASSWORD`, then `npm run seed:demo` creates two coaches with twenty athletes each and a full run history (`npm run seed:dry` previews without writing; `seed:reset` and `seed:purge` rebuild or remove only the demo accounts).
4. **Checks.** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — all four are clean on the submitted commit.

---

## Environment Variables

`.env.example` is the template; copy it to `.env.local` for development and set the same keys in Vercel (Project → Settings → Environment Variables) for production. Nothing with a secret is ever committed.

| Variable | Where it comes from | Used by | Required |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Browser and server clients | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key. Safe in the browser: every query it makes is filtered by Row Level Security | Browser and server clients | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key. **Bypasses RLS** — server only, never prefixed `NEXT_PUBLIC_` | The nightly cron and the health webhook (`lib/supabase/server.ts → createServiceRoleClient`); the seed script | Yes |
| `NEXT_PUBLIC_APP_URL` | The app's own address (`http://localhost:3000` locally, `https://runi-coach.vercel.app` in production) | Links inside auth e-mails and OAuth callbacks | Yes |
| `CRON_SECRET` | A long random string you generate; Vercel sends it as `Authorization: Bearer …` to `/api/cron/sync-intervals` | The cron route refuses every call without it | Yes in production |
| `TZ` | `Asia/Jerusalem` | Server-side date arithmetic — one calendar for the whole product | Yes |
| `HEALTH_WEBHOOK_ENABLED` | `false` unless you run the bridging app for sleep / HRV data | `/api/webhooks/health` returns 404 when off | No (default off) |
| `HEALTH_WEBHOOK_SECRET` | A random string shared with the bridging app, sent as `X-Webhook-Secret` | The health webhook | Only if the webhook is on |
| `INTERVALS_ICU_API_KEY`, `INTERVALS_ICU_ATHLETE_ID` | intervals.icu → Settings → Developer | **Local scripts only** (`npm run analyze`, `npm run check:wellness`). The app itself stores each athlete's own credentials server-side, entered under Settings → Connections | No |
| `DEMO_PASSWORD` | A password you choose for the 42 demo accounts | `npm run seed:demo` / `seed:reset` | Only for seeding |

Each athlete's intervals.icu key is stored in `provider_connections`, readable only by that athlete (RLS), and is never sent back to the browser in full — the interface shows the last four characters.

---

## For Reviewers

The live app is at **[runi-coach.vercel.app](https://runi-coach.vercel.app)**. Two seeded accounts show both sides of the product without signing up (the password is included with the submission, not in this repository):

| Role | Email | What to look at |
|---|---|---|
| Coach | `coach1@demo.runi-coach.app` | Roster with attention flags, preparation cycles, templates, Settings → Billing (packages and the payment-method mockup) |
| Athlete | `runner1-coach1@demo.runi-coach.app` | Dashboard, plan, Your Numbers, Ask Runi |

Signing up with your own address also works. Auth e-mails go out through Resend's shared test sender, which delivers only to the project owner's address until a verified domain is attached — one of the known limitations below.

---

## Testing

```bash
npm test            # 842 tests across 57 files, about 20 seconds
npm run test:watch
npm run lint
```

- Covered automatically: the physiological model, plan generation on all three paths, the adaptation engine (including the drift trigger), metric history, input validation (race goal, webhook payload, session edits), the same-origin redirect guard, time zones and chart geometry.
- Covered manually and documented in the test specification: Row Level Security policies, the join-code flow, browser screens and external providers.

---

## Documentation

All submission documents are in `docs/הגשה סופית/` (Hebrew); `0 - Runi - תיק הגשה מאוחד.pdf` binds them into one file with a cover and a table of contents.

| # | Document |
|---|---|
| 1 | Product Specification |
| 2 | Software Architecture |
| 3 | Detailed Technical Design |
| 4 | Test Specification |
| 5 | Information Security |
| 6 | Scale and Performance |
| 7 | Presentation — `7 - מצגת - Runi.html`, open in a browser (also served live at [runi-coach.vercel.app/deck.html](https://runi-coach.vercel.app/deck.html)); F for full screen, arrow keys to navigate, N for speaker notes |
| 8 | The Numbers — what the watch sends, how every metric is computed, and where it appears in the product |
| 9 | Links and review accounts |
| 10 | What was built, how to use it, what was easy and what was hard |

Alongside them, `docs/process/` holds the pre-release audit and QA rounds and the project log.

---

## Known Limitations

- **Billing is a mockup.** Choosing a package writes the row the seat cap reads; the payment-method form under Settings → Billing stores nothing and nothing is charged. A payment provider's webhook will own the `plan` column when it is connected.
- **Adaptation is automatic for reductions only.** The engine reduces and restores the coming week on its own. Moving a build week after missed sessions is produced as a recommendation and not applied; the next version surfaces it — and the reductions — for the athlete or coach to confirm.
- **Health webhook is off by default.** `/api/webhooks/health` accepts sleep / HRV / resting-heart-rate data from a bridging app with one shared secret per deployment rather than a per-athlete token, so it stays disabled (`HEALTH_WEBHOOK_ENABLED=false`) until that is redesigned.
- **Direct Strava OAuth is parked.** Every device reaches Runi through intervals.icu, which aggregates Garmin, Polar, Coros, Suunto and Strava itself. The `strava_connections` table remains in the schema for a future direct integration.
- **Google and Apple sign-in are not connected.** The buttons on the login screen say so when pressed; e-mail sign-in is the path today.
- **Email domain.** Auth e-mails go out through Resend's shared test sender, which delivers only to the project owner. A verified domain lifts that.
- **Sync throughput.** The nightly job processes athletes one by one. It holds up to a few hundred users; beyond that a queue is required (see the scale document).
- **Role is chosen at signup.** An account is an athlete or a coach from the start. A coach account also has its own training view ("My training"); an athlete account cannot become a coach from inside the product.
- **Native app.** There is none. Runi is a web application built to be used fully from a phone.

---

<div align="center">

Samuel Asmara · Reichman University · 2026

</div>
