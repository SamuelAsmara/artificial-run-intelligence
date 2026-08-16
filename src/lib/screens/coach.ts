/**
 * Coach dashboard model — ported from
 * design_handoff_ari_athlete_app/ARI Coach.dc.html.
 *
 * Roster maps to coach_athletes + profiles; alerts are derived from
 * readiness_snapshots (ACWR > 1.5 = injury risk). Messages and plan codes
 * have no tables yet — they are demo-only until those are designed.
 */

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function coachQrPath(): string {
  const rnd = seeded(7);
  let d = "";
  const c = 8;
  const eye = (x: number, y: number) => {
    d += "M" + x + " " + y + "h" + c * 3 + "v" + c * 3 + "h-" + c * 3 + "z";
  };
  eye(8, 8); eye(8, 64); eye(64, 8);
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 11; j++) {
      if ((i < 4 && j < 4) || (i < 4 && j > 6) || (i > 6 && j < 4)) continue;
      if (rnd() > 0.5)
        d += "M" + (8 + i * c) + " " + (8 + j * c) + "h" + (c - 2) + "v" + (c - 2) + "h-" + (c - 2) + "z";
    }
  }
  return d;
}

export interface CmpSeries {
  id: string; name: string; initials: string; color: string; v: number[];
}

let _cs: CmpSeries[] | null = null;
export function cmpSeries(): CmpSeries[] {
  if (_cs) return _cs;
  const mk = (seed: number, start: number, end: number) => {
    const rnd = seeded(seed);
    return Array.from({ length: 12 }, (_, i) => start + (end - start) * (i / 11) + (rnd() - 0.5) * 3);
  };
  _cs = [
    { id: "SC", name: "Samuel", initials: "SC", color: "var(--color-accent)", v: mk(1, 40, 48) },
    { id: "NB", name: "Noa", initials: "NB", color: "var(--color-negative)", v: mk(2, 44, 58) },
    { id: "YP", name: "Yoav", initials: "YP", color: "var(--color-positive)", v: mk(3, 50, 61) },
    { id: "GA", name: "Gal", initials: "GA", color: "var(--color-atl)", v: mk(4, 36, 52) },
  ];
  return _cs;
}

/** [name, sex, age, level, race, raceDate, readiness, acwr, weeklyKm, status] */
export const ATHLETES: [string, string, number, string, string, string, number, number, number, string][] = [
  ["Samuel Cohen", "M", 34, "Intermediate", "Marathon", "Oct 11", 82, 1.08, 42, "On track"],
  ["Dana Levi", "F", 29, "Advanced", "Half", "Sep 20", 74, 1.21, 58, "On track"],
  ["Omer Shani", "M", 41, "Beginner", "10K", "Sep 6", 66, 1.02, 24, "On track"],
  ["Noa Bar", "F", 35, "Intermediate", "Marathon", "Oct 11", 38, 1.58, 71, "At risk"],
  ["Yoav Peretz", "M", 27, "Advanced", "Marathon", "Nov 8", 88, 0.94, 64, "On track"],
  ["Maya Golan", "F", 31, "Intermediate", "10K", "Aug 30", 55, 1.34, 39, "Watch"],
  ["Idan Mor", "M", 38, "Beginner", "5K", "Aug 23", 71, 0.88, 16, "On track"],
  ["Shira Adler", "F", 44, "Intermediate", "Half", "Oct 4", 47, 1.49, 52, "Watch"],
  ["Tom Raz", "M", 25, "Advanced", "5K", "Sep 13", 91, 1.05, 48, "On track"],
  ["Lior Katz", "M", 36, "Intermediate", "Half", "Sep 27", 29, 1.66, 66, "At risk"],
  ["Efrat Sela", "F", 33, "Beginner", "10K", "Oct 18", 77, 0.97, 21, "On track"],
  ["Gal Amir", "F", 26, "Advanced", "Marathon", "Nov 8", 62, 1.18, 69, "New"],
];

export const RACE_TIMELINE: [string, string, string, number][] = [
  ["Aug 23", "Idan Mor", "5K", 12], ["Aug 30", "Maya Golan", "10K", 19],
  ["Sep 6", "Omer Shani", "10K", 26], ["Sep 13", "Tom Raz", "5K", 33],
  ["Sep 20", "Dana Levi", "Half", 40], ["Sep 27", "Lior Katz", "Half", 47],
  ["Oct 4", "Shira Adler", "Half", 54], ["Oct 11", "Samuel + Noa", "Marathon", 61],
];

export interface Thread {
  name: string;
  unread: boolean;
  msgs: { who: "a" | "c"; text: string }[];
}

export const INITIAL_THREADS: Thread[] = [
  {
    name: "Noa Bar", unread: true,
    msgs: [
      { who: "a", text: "Felt a twinge in my left calf on today’s run. Stopped at 5k to be safe." },
      { who: "c", text: "Good call. Skip tomorrow’s intervals — I’ll swap in an easy 30 min if it feels fine." },
      { who: "a", text: "Thanks. Will ice tonight and report tomorrow." },
    ],
  },
  {
    name: "Dana Levi", unread: true,
    msgs: [{ who: "a", text: "Taper plan looks good — one question about Thursday’s session, is it 4 or 6 strides?" }],
  },
  {
    name: "Idan Mor", unread: false,
    msgs: [
      { who: "a", text: "Can I move the long run to Sunday? Family thing on Saturday." },
      { who: "c", text: "Sure — moved. Keep it easy, 16 km." },
    ],
  },
  {
    name: "Tom Raz", unread: false,
    msgs: [
      { who: "a", text: "PB today! 19:02 on the 5K time trial." },
      { who: "c", text: "Huge. That confirms the sub-19 target for Sep 13." },
    ],
  },
];

export const PLAN_CODES: Record<string, string> = {
  "Marathon · 12 wk": "ARI-7F3K-9Q",
  "Half · 10 wk": "ARI-2MD8-4T",
  "10K · 8 wk": "ARI-9BX2-1L",
};

export const COACH_COPY = {
  brand: "ARI", coachTag: "Coach",
  navAthletes: "Athletes", navPlans: "Plans", navSettings: "Settings",
  greeting: "Good morning, Coach Dana",
  context: "Tuesday · 12 athletes · 3 races ahead",
  sharePlan: "Share plan code",
  alertsTitle: "Needs attention",
  alertsSub: "Generated daily from readiness snapshots",
  rosterTitle: "Roster", fGender: "Gender", fLevel: "Level", fRace: "Race",
  hAthlete: "Athlete", hLevel: "Level", hRace: "Race", hRaceDate: "Race day",
  hReadiness: "Readiness", hAcwr: "ACWR", hKm: "Wk volume", hStatus: "Status",
  cmpTitle: "Fitness comparison · marathon group",
  cmpSub: "CTL over the last 12 weeks",
  racesTitle: "Upcoming races", racesSub: "Next 90 days",
  msgTitle: "Messages", msgView: "View athlete →",
  msgPlaceholder: "Reply…", msgSend: "Send",
  shareTitle: "Share a plan with an athlete",
  shareSub: "The athlete scans the QR or types the code in their app. Joining links their data to your roster.",
  sharePlanField: "Plan", shareCode: "Code",
  shareNote: "The code grants you access to the athlete’s training data. It expires after 7 days.",
  done: "Done",
};
