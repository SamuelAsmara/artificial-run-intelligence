# Design handoffs — which version is live

`design_handoff_ari_athlete_app/` holds exactly one current version of each
screen. Superseded handoffs live in `_archive/design_handoffs_v1/` and are not
loaded by anything.

| Screen | Handoff | Ported to | Status |
|---|---|---|---|
| Dashboard | `ARI Dashboard.dc.html` | `components/dashboard/DashboardView.tsx` | live, real data |
| Activities | `ARI Activities.dc.html` | `components/screens/ActivitiesView.tsx` | live, real data |
| Activity detail | `ARI Activity Detail.dc.html` **v2** | `components/screens/ActivityDetailView.tsx` | **v2 port in progress** |
| Plan | `ARI Plan.dc.html` | `components/screens/PlanView.tsx` | live, real data |
| Settings | `ARI Settings.dc.html` **v2** | `components/screens/SettingsView.tsx` | live, real data |
| Coach | `ARI Coach.dc.html` | `components/screens/CoachView.tsx` | live, demo data |
| Login | `ARI Login.dc.html` | `components/screens/LoginView.tsx` | live — **not restyled by request** |

`README_activity_chart_v2.md` is the implementation spec for the v2 activity
chart, as written by Claude Design.

## Design revisions requested so far, and where each one landed

1. **Empty dashboard state** — a new account must not see a borrowed readiness
   score, personal best or race countdown. → `components/dashboard/EmptyDashboard.tsx`;
   demo data moved behind `/dashboard?demo=1`. **Done.**
2. **Design must survive real data** — appearance decisions extracted so that
   incoming data inherits the design rather than having one invented for it.
   → `lib/dashboard/presentation.ts`, whose header states that nothing in the
   file may consult data. **Done.**
3. **intervals.icu first in the connections list** — and reaching end to end.
   → provider registry ordering + the v2 connections row. **Done.**
4. **Providers kept as a roadmap** — Garmin and Suunto stay listed with an
   honest status, so the product commits to applying for partner access rather
   than pretending intervals.icu is permanent. → `lib/providers/registry.ts`.
   **Done.**
5. **Apple Health, not Apple Watch** — the integration target is the iPhone,
   which serves watch owners and phone-only runners alike. **Done.**
6. **Settings as disclosure** — state up front, editor only when asked.
   Superseded by the v2 handoff, which flips the whole profile card instead.
   **Superseded, deliberately.**
7. **Settings layout: details across the top, then two columns** — superseded by
   the v2 handoff's single column of three cards. **Superseded, deliberately.**
8. **Profile photo with framing** — drag to reposition, stored as
   `avatar_position`. → `components/settings/AvatarEditor.tsx`. **Done.**
9. **ISO week numbering, never drop a week** — a training plan has no gaps, and
   an interruption is something the plan must answer for. → `lib/dashboard/rail.ts`.
   **Done.**
10. **Every run opens its own detail** — ids threaded through instead of a
    hardcoded link. **Done.**
11. **Planned vs actual must describe the run you opened** — and show nothing at
    all when no session was planned. → `lib/activity/plannedVsActual.ts`.
    **Done.**
12. **The chart must be proportional, not stretched** — resampling with
    averaging, and an axis derived from the run. → `lib/activity/resample.ts`.
    **Done.**
13. **Show the run as the watch recorded it** — no trimming of stopped time;
    stops appear as bounded dips. **Done.**
14. **Login left alone** — by request, until the rest is finished. **Open.**
15. **Activity chart v2** — five stacked bands, per-km segment strip, dual X
    axis, crosshair, drag to select. **In progress.**
