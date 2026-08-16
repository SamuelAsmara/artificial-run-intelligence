/**
 * Activities screen model — ported from
 * design_handoff_ari_athlete_app/ARI Activities.dc.html.
 * Maps to activities (+ activity_streams for the pace sparkline).
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fmtPace = (s: number) =>
  Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.round(s % 60);
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0");
};

export interface Act {
  type: string; name: string; date: string; km: string; time: string;
  pace: string; paceSec: number; hr: string; kmN: number;
  spark: string; sparkColor: string;
}

const NAMES: Record<string, string> = {
  easy: "Easy Run", tempo: "Tempo Run", int: "Intervals", long: "Long Run",
};
const PACE_BASE: Record<string, number> = { easy: 330, tempo: 292, int: 298, long: 340 };
const HR_BASE: Record<string, number> = { easy: 142, tempo: 165, int: 171, long: 151 };
const BASE: [string, number][] = [
  ["easy", 5], ["tempo", 7], ["int", 9.6], ["easy", 6],
  ["easy", 8], ["rest", 0], ["long", 26],
];
const MULT = [0.82, 0.88, 0.61, 1.0];
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function spark(fade: boolean, seed: number) {
  const rr = rng(seed);
  const n = 26;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    let p = 0.5 + (rr() - 0.5) * 0.34;
    if (fade && i > 13) p += (i - 13) * 0.05;
    pts.push(p);
  }
  const lo = Math.min(...pts), hi = Math.max(...pts);
  return pts.map((p, i) =>
    (i ? "L" : "M") + ((i / (n - 1)) * 78 + 1).toFixed(1) + " " +
    (2 + ((p - lo) / (hi - lo || 1)) * 18).toFixed(1)).join("");
}

let _d: { acts: Act[]; weekKm: number[]; wp: number[] } | null = null;

export function buildActivities() {
  if (_d) return _d;
  const r = rng(11);
  const start = new Date(2026, 6, 19);
  const acts: Act[] = [];
  const weekKm = [0, 0, 0, 0];

  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 7; d++) {
      const b = BASE[d];
      if (b[0] === "rest") continue;
      if (w === 1 && d === 1) continue; // missed session
      if (w === 3 && d > 0) continue;   // current week: only Sunday is done
      const dt = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const km = Math.round(b[1] * MULT[w] * (0.97 + r() * 0.06) * 10) / 10;
      const pace = PACE_BASE[b[0]] * (0.98 + r() * 0.05);
      const hr = Math.round(HR_BASE[b[0]] + (r() - 0.5) * 8);
      const fade = b[0] === "long" || r() > 0.75;
      weekKm[w] += km;
      acts.push({
        type: b[0], name: NAMES[b[0]],
        date: MO[dt.getMonth()] + " " + dt.getDate(),
        km: km.toFixed(1), time: fmtTime(km * pace), pace: fmtPace(pace),
        paceSec: pace, hr: String(hr), kmN: km,
        spark: spark(fade, w * 10 + d),
        sparkColor: fade ? "var(--color-caution)" : "var(--color-muted)",
      });
    }
  }
  acts.reverse();

  _d = { acts, weekKm: weekKm.map((k) => Math.round(k)), wp: [338, 334, 331, 326] };
  return _d;
}

export const ACT_COPY = {
  brand: "ARI", navHome: "Home", navActivities: "Activities",
  navPlan: "Plan", navSettings: "Settings",
  title: "Activities", subtitle: "Training history · last 4 weeks",
  volTitle: "Weekly distance", paceTitle: "Easy-run pace trend",
  paceSub: "faster ↑ · weekly average",
  histTitle: "All runs",
  hDate: "Date", hType: "Session", hDist: "Dist", hTime: "Time",
  hPace: "Pace", hHr: "Avg HR", hSpark: "Pace shape",
};
