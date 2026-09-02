<div align="center">

# Runi — Run with Intelligence

**A training platform for runners and their coaches, where every decision is backed by the athlete's own data.**

[![Live](https://img.shields.io/badge/live-runi--coach.vercel.app-0a0a0a?style=flat-square)](https://runi-coach.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-20232a?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Tests](https://img.shields.io/badge/tests-835%20passing-2bb3a3?style=flat-square)](#testing)

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
- [For Reviewers](#for-reviewers)
- [Testing](#testing)
- [Documentation](#documentation)
- [Known Limitations](#known-limitations)

---

## Overview

Runi connects a runner's watch to their training. From that point on, the plan, the load, the recovery and the progress toward race day are all grounded in the athlete's own numbers rather than in a generic table.

The same engine serves the coach: one place that shows, every morning, which athletes need attention, which preparation cycle each one belongs to, and what week they are in.

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
- An adaptation engine that scales a session back when load spikes, and explains why in one sentence
- The athlete can leave a plan at any time; history is kept

**Your Numbers**
- One board with every metric the product computes: heart rate, pace, volume, recovery, training load, CTL / ATL / TSB, ACWR, grade-adjusted pace, drift and prediction
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
- Athletes always use Runi for free; a coach picks a package right after signing up
- Basic — free, up to five athletes; Premium — monthly subscription, unlimited athletes, free-text chat with Runi in the next version
- The Basic limit is enforced in the database when an athlete redeems a code; billing is not connected yet, so Premium opens without a charge

---

## Design Principles

- **Every number is the athlete's own.** Nothing on screen is generic. Every metric is computed from that athlete's runs, sleep and heart-rate data.
- **Every number has a tested function behind it.** The physiological model, the planner and the adaptation engine are pure functions with unit tests.
- **Explain, do not just display.** Each metric comes with its formula and its current band; each adaptation comes with its reason.
- **Consent flows from the athlete.** A coach can read and plan only for athletes who entered the coach's code themselves.
- **No language model in the current version.** Ask Runi answers directly from the data. A future version will connect it to a model (Grok) that phrases answers on top of the same calculations.

---

## Architecture

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Data & Auth | Supabase — Postgres with Row Level Security, Supabase Auth |
| Hosting | Vercel, with a daily cron job for watch synchronisation |
| Validation | Zod, at every server boundary |
| Testing | Vitest |

Three decisions shape most of the codebase:

- **Authorisation lives in the database.** Row Level Security on all 17 tables. An athlete reads only their own rows; a coach reads only the athletes who joined them. Writes a coach is allowed to make go through narrow, security-definer functions rather than broad policies.
- **Computation is separate from presentation.** All logic — planning, readiness, load, metric history — lives in `lib/` as pure functions with no knowledge of React or the database. This is what makes the test suite fast and complete.
- **One time zone for the whole product.** `Asia/Jerusalem` everywhere, so a run that ends at 23:50 stays on the day it was run.

---

## Project Structure

```
src/
├── app/            Pages and API routes (App Router), including error and not-found pages
├── components/     Presentational components — receive data, never fetch it
├── actions/        Server Actions — the boundary between client and database
├── lib/            Pure logic: planning, readiness, activity, insights, screens, time
└── types/          Database types, derived from the schema
supabase/migrations/   22 numbered, backward-compatible migrations
scripts/               Manual sync, analysis and demo data
docs/                  Project documents, technical guide and presentation
```

---

## Getting Started

**Prerequisites:** Node 20+ and a Supabase project (the free tier is sufficient).

```bash
npm install
cp .env.example .env.local     # every variable is documented in the file
npm run dev
```

- **Database:** run every file in `supabase/migrations/` in numeric order (`0001` … `0023`), in the Supabase SQL Editor.
- **Demo data:** `npm run seed:demo` creates two coaches with twenty athletes each and a full run history. Credentials are in `docs/DEMO_LOGINS.md`.
- **Email:** Supabase Auth sends the confirmation and password-reset emails; Resend is plugged in as the SMTP provider. `email/README.md` has the exact dashboard settings.

---

## For Reviewers

The live app is at **[runi-coach.vercel.app](https://runi-coach.vercel.app)**. Two seeded accounts show both sides of the product without signing up (the password is included with the submission, not in this repository):

| Role | Email | What to look at |
|---|---|---|
| Coach | `coach1@demo.ari-coach.app` | Roster with attention flags, preparation cycles, templates, Settings → Billing (packages and the payment-method mockup) |
| Athlete | `runner1-coach1@demo.ari-coach.app` | Dashboard, plan, Your Numbers, Ask Runi |

Signing up with your own address also works, but the confirmation email is sent from Resend's shared test domain, which only delivers to the project owner until a verified domain is attached — one of the known limitations below.

---

## Testing

```bash
npm test            # 835 tests across 57 files
npm run test:watch
npm run lint
```

- Covered automatically: the physiological model, plan generation on all three paths, the adaptation engine, metric history, validation, time zones and chart geometry.
- Covered manually and documented in the testing document: Row Level Security policies, browser screens and external providers.

---

## Documentation

All documents are in `docs/הגשה סופית/` (Hebrew):

| # | Document |
|---|---|
| 1 | Product Specification |
| 2 | Software Architecture |
| 3 | Detailed Technical Design |
| 4 | Test Specification |
| 5 | Information Security |
| 6 | Scale and Performance |

| 7 | Presentation (`7 - מצגת - Runi.pptx`) |

Alongside them, in `docs/`: the technical guide (`Runi_technical_guide.html`) and the code map (`Runi_code_map.html`).

---

## Known Limitations

- **Billing** — package choice is live (athletes: Basic free, Premium with RunAI coming next; coaches: Basic free for six months, then $5/mo, Premium $10/mo); charging through a payment provider is not connected yet — the payment-method form under Settings → Billing is a labelled mockup that stores nothing.
- **Email domain** — auth emails go out through Resend's shared test sender, which delivers only to the project owner. A verified domain lifts that.
- **Sync throughput** — the daily job processes athletes one by one. It holds up to a few hundred users; beyond that a queue is required (see the scale document).
- **Native app** — there is none. Runi is a web application built to be used fully from a phone.

---

<div align="center">

Samuel Asmara · Reichman University · 2026

</div>
