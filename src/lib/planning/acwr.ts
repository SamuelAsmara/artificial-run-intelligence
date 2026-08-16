/**
 * ACWR — Acute:Chronic Workload Ratio.
 * יחס בין עומס 7 הימים האחרונים (Acute) לעומס הממוצע היומי של 28 יום (Chronic).
 * מסמך תכנון טכני §6, מסמך אפיון בדיקות §1 (calculateACWR).
 *
 * ערך מעל 1.5 = עלייה חדה מדי בעומס ביחס להרגל — מוריד את עצימות השבוע הבא
 * (ראו adjustPlan.ts).
 */

export interface DailyLoad {
  /** תאריך היום, ISO (YYYY-MM-DD) */
  date: string;
  /** "עומס" ליום — לרוב distance_m * intensity factor, כאן פשוט מרחק במטרים */
  load: number;
}

export const ACWR_INJURY_RISK_THRESHOLD = 1.5;
const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;

export interface AcwrResult {
  acute: number;
  chronic: number;
  /** null = אין מספיק היסטוריה (פחות מיום אחד עם נתונים) — לא שגיאה */
  acwr: number | null;
}

/**
 * @param dailyLoads עומס יומי, ממוין מהישן לחדש, מכסה עד 28 הימים האחרונים
 * @param asOf התאריך שממנו סופרים אחורה (ברירת מחדל: היום)
 */
export function calculateACWR(dailyLoads: DailyLoad[], asOf: Date = new Date()): AcwrResult {
  if (dailyLoads.length === 0) {
    return { acute: 0, chronic: 0, acwr: null };
  }

  const asOfTime = asOf.getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  let acuteSum = 0;
  let chronicSum = 0;

  for (const entry of dailyLoads) {
    const t = new Date(entry.date).getTime();
    // מספר ימים שלמים אחורה מ-asOf (0 = היום עצמו). שימוש בהפרש ימים שלם
    // (במקום השוואת מילישניות גולמית) מונע off-by-one על גבול החלון המדויק.
    const daysBack = Math.floor((asOfTime - t) / msPerDay);
    if (daysBack < 0) continue; // עתידי ביחס ל-asOf
    if (daysBack < CHRONIC_WINDOW_DAYS) chronicSum += entry.load;
    if (daysBack < ACUTE_WINDOW_DAYS) acuteSum += entry.load;
  }

  const acute = acuteSum / ACUTE_WINDOW_DAYS;
  const chronic = chronicSum / CHRONIC_WINDOW_DAYS;

  // "אין מספיק נתונים" (מסמך אפיון בדיקות §6) — לא מציגים 0/0 כ-Infinity/NaN
  if (chronic === 0) {
    return { acute, chronic, acwr: null };
  }

  return { acute, chronic, acwr: acute / chronic };
}

export function isHighInjuryRisk(result: AcwrResult): boolean {
  return result.acwr !== null && result.acwr > ACWR_INJURY_RISK_THRESHOLD;
}
