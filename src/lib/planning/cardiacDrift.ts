/**
 * Cardiac Drift — בתוך אימון בודד:
 *
 * הערה: הפונקציה הזאת אינה בשימוש כרגע. סחיפת הדופק שמוצגת במוצר מחושבת
 * ב-`lib/activity/metrics.ts`, על הזרם המדוגם מחדש. זו נשארת כיוון שהיא
 * החישוב שמסמך התכנון מתאר, אבל אין לה קורא מלבד הטסט שלה.
 * אם הדופק עולה בעוד הקצב נשאר קבוע,
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

  /*
   * חוצים לפי זמן, לא לפי מספר הדגימות.
   *
   * `stream.length / 2` מניח שכל הדגימות במרווחים שווים. השדה `t` קיים כאן
   * בדיוק מפני שהן לא תמיד — שעון שמדלג על שניות, או מקטע עם קליטה חלשה,
   * מזיז את נקודת האמצע האמיתית. חצי מהזמן הוא מה שהמדד מתיימר להשוות.
   */
  const t0 = stream[0].t;
  const tEnd = stream[stream.length - 1].t;
  const half = t0 + (tEnd - t0) / 2;

  const firstHalf = stream.filter((p) => p.t <= half);
  const secondHalf = stream.filter((p) => p.t > half);

  // מחצית ריקה אינה השוואה. קורה כשכל הדגימות נדחסו לצד אחד של האמצע.
  if (firstHalf.length === 0 || secondHalf.length === 0) {
    return { hrDriftPct: 0, paceChangePct: 0, isSignificantDrift: false };
  }

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
