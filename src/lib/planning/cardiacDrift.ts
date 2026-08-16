/**
 * Cardiac Drift — בתוך אימון בודד: אם הדופק עולה בעוד הקצב נשאר קבוע,
 * זהו סימן לעייפות/התייבשות. מסמך תכנון טכני §6, מסמך אפיון בדיקות §1.
 */

export interface StreamPoint {
  /** שניות מתחילת האימון */
  t: number;
  heartRate: number;
  /** מ'/שנייה */
  pace: number;
}

export interface CardiacDriftResult {
  /** אחוז עלייה בדופק בין המחצית הראשונה לשנייה של האימון */
  hrDriftPct: number;
  /** אחוז שינוי בקצב בין המחציות (חיובי = האטה) */
  paceChangePct: number;
  /** true אם הדופק עלה משמעותית בעוד הקצב נשאר יציב יחסית */
  isSignificantDrift: boolean;
}

const HR_DRIFT_THRESHOLD_PCT = 5; // עלייה של 5%+ בדופק
const PACE_STABILITY_THRESHOLD_PCT = 3; // קצב נחשב "יציב" אם השתנה פחות מ-3%

export function detectCardiacDrift(stream: StreamPoint[]): CardiacDriftResult {
  if (stream.length < 4) {
    return { hrDriftPct: 0, paceChangePct: 0, isSignificantDrift: false };
  }

  const midpoint = Math.floor(stream.length / 2);
  const firstHalf = stream.slice(0, midpoint);
  const secondHalf = stream.slice(midpoint);

  const avg = (points: StreamPoint[], key: "heartRate" | "pace") =>
    points.reduce((sum, p) => sum + p[key], 0) / points.length;

  const hr1 = avg(firstHalf, "heartRate");
  const hr2 = avg(secondHalf, "heartRate");
  const pace1 = avg(firstHalf, "pace");
  const pace2 = avg(secondHalf, "pace");

  const hrDriftPct = hr1 === 0 ? 0 : ((hr2 - hr1) / hr1) * 100;
  const paceChangePct = pace1 === 0 ? 0 : ((pace1 - pace2) / pace1) * 100;

  const isSignificantDrift =
    hrDriftPct >= HR_DRIFT_THRESHOLD_PCT &&
    Math.abs(paceChangePct) <= PACE_STABILITY_THRESHOLD_PCT;

  return { hrDriftPct, paceChangePct, isSignificantDrift };
}
