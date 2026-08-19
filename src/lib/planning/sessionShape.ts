/**
 * What a planned session looks like as a bar.
 *
 * ## Why this file exists
 *
 * `plan_workouts` stores a type, a distance and a target pace. It does **not**
 * store structure — there is no "6 × 800 m" anywhere in the database. So the
 * segmented bar on the dashboard and the plan screen is an *illustration of the
 * session type at the athlete's own numbers*, not a prescription read back.
 *
 * That distinction is the whole point. Two generators drew this bar before —
 * `segsFor` in dashboard/model.ts and `planSegsFor` in screens/plan.ts — and
 * both were the prototype's, with the prototype's athlete baked in. Clicking a
 * *real* planned day produced tooltips reading "Warm-up 10 min", "800 m rep @
 * 4:15" and "90 s jog" whatever the actual session was: an 18 km long run and a
 * 5 km recovery jog were both described as somebody else's track workout.
 *
 * One function now, fed the athlete's own distance and pace, so every number in
 * a tooltip is a number that belongs to them. Where the shape is our suggestion
 * rather than their data — the rep count, the warm-up share — the screens say
 * so in the caption underneath.
 *
 * The old generators stay for the reference render (`/dashboard` and `/plan`
 * with no data), which is the one place the prototype's session is honest.
 */

/** The screens' workout vocabulary, which is not the database's. */
export type ShapeType = "easy" | "tempo" | "int" | "long" | "rest";

export interface Segment {
  /** proportional width; the caller normalises against the total */
  m: number;
  /** bar height in px, which is how effort is drawn */
  h: number;
  /** tooltip */
  t: string;
}

/** How many reps we draw an interval session as. Ours, not the plan's. */
const REPS = 6;

/** Reps take about half an interval session; the rest is warm-up and cool-down. */
const REP_SHARE = 0.5;

/** A recovery jog, as a fraction of the rep it follows. */
const RECOVERY_SHARE = 0.4;

const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`;

/**
 * Segments for one planned session.
 *
 * `distanceKm` of zero — a rest day, or a session the generator left open —
 * returns nothing, and the caller hides the bar rather than drawing a shape
 * with no size behind it.
 */
export function sessionShape({
  type,
  distanceKm,
  pace,
}: {
  type: ShapeType;
  distanceKm: number;
  /** "4:15", as stored in `plan_workouts.planned_pace` */
  pace: string | null;
}): Segment[] {
  if (type === "rest" || !Number.isFinite(distanceKm) || distanceKm <= 0) return [];

  const at = pace ? ` @ ${pace}/km` : "";
  const metres = distanceKm * 1000;

  if (type === "easy") return [{ m: 1, h: 22, t: `${km(metres)} easy${at}` }];
  if (type === "long") return [{ m: 1, h: 30, t: `${km(metres)} steady${at}` }];

  if (type === "tempo") {
    // A fifth either side of the effort — the same proportion the prototype
    // drew as "10 minutes", except expressed in the athlete's own distance.
    const ends = metres * 0.2;
    const middle = metres - ends * 2;
    return [
      { m: ends, h: 16, t: `Warm-up · ${km(ends)} easy` },
      { m: middle, h: 44, t: `Tempo · ${km(middle)}${at}` },
      { m: ends, h: 16, t: `Cool-down · ${km(ends)} easy` },
    ];
  }

  // Intervals.
  const repTotal = metres * REP_SHARE;
  const rep = repTotal / REPS;
  const ends = (metres - repTotal) / 2;

  const segs: Segment[] = [{ m: ends, h: 16, t: `Warm-up · ${km(ends)} easy` }];
  for (let i = 0; i < REPS; i++) {
    segs.push({ m: rep, h: 48, t: `${Math.round(rep)} m${at}` });
    if (i < REPS - 1) {
      segs.push({ m: rep * RECOVERY_SHARE, h: 10, t: `Recovery jog · ${Math.round(rep * RECOVERY_SHARE)} m` });
    }
  }
  segs.push({ m: ends, h: 16, t: `Cool-down · ${km(ends)} easy` });
  return segs;
}

/**
 * Roughly how long a planned session takes, in minutes.
 *
 * From the session's own target pace. The plan screen used to multiply the
 * distance by 4.9 or 5.6 minutes per kilometre depending on the type — two
 * constants from the prototype athlete — and print the result as "· ~34 min"
 * beside a target pace it had just ignored. An athlete running 6:20/km was told
 * their 10 km would take 56 minutes.
 *
 * Returns null when there is no pace to work from, and the caller omits the
 * figure rather than inventing one.
 */
export function plannedMinutes(distanceKm: number, pace: string | null): number | null {
  if (!pace || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  const match = /^(\d+):([0-5]\d)$/.exec(pace.trim());
  if (!match) return null;
  const secondsPerKm = Number(match[1]) * 60 + Number(match[2]);
  return Math.round((secondsPerKm * distanceKm) / 60);
}
