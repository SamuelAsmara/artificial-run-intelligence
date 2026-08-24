/**
 * A template as a shape, and who is currently standing in it.
 *
 * A template has no dates — it is week 1 to week N, and twenty athletes are
 * each somewhere inside it having started on twenty different days. That is
 * the thing the coach could not see: the templates screen was a form with a
 * "weeks" counter and no answer to "who does changing this affect?".
 *
 * Which week an athlete is in is counted backwards from their race, because
 * that is how the plan was built: the last week of the template is race week.
 * An athlete racing in 30 days on a 12-week template is in week 8.
 */

export interface TemplateAthlete {
  id: string;
  name: string;
  raceType: string | null;
  /** ISO date */
  raceDate: string | null;
}

export interface TemplateWeek {
  /** 1-based, as the coach reads it */
  number: number;
  athletes: TemplateAthlete[];
  /**
   * True when editing this week still changes something for somebody.
   *
   * An athlete already past week 5 has run week 5. Rewriting it changes
   * nothing for them, and the interface should say so rather than letting the
   * coach believe they have adjusted twenty people's training when they have
   * adjusted eleven.
   */
  editable: boolean;
}

const DAY = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / DAY);
}

/**
 * Which week of an N-week programme an athlete is in today.
 *
 * Returns null when there is nothing to place them by — no race, or a race
 * already run. Clamped into the programme: an athlete who joined late, with
 * fewer weeks left than the template has, is in the week that matches the time
 * they actually have, not week 1.
 */
export function weekOf(
  athlete: TemplateAthlete,
  weeks: number,
  today: string,
): number | null {
  if (!athlete.raceDate || weeks < 1) return null;
  const days = daysBetween(today, athlete.raceDate);
  if (days < 0) return null;

  // Race week is the last week. `days === 0` is race day itself, still week N.
  const weeksOut = Math.floor(days / 7);
  const week = weeks - weeksOut;
  return Math.min(weeks, Math.max(1, week));
}

/**
 * The template laid out week by week, with the athletes standing in each.
 *
 * @param raceType only athletes racing this distance are placed
 */
export function templateWeeks(
  athletes: TemplateAthlete[],
  raceType: string,
  weeks: number,
  today: string,
): TemplateWeek[] {
  const out: TemplateWeek[] = [];
  const mine = athletes.filter((a) => a.raceType === raceType);

  // The earliest week anybody is still short of. Weeks before it are history
  // for everyone in this group, so editing them changes nothing.
  const positions = mine
    .map((a) => weekOf(a, weeks, today))
    .filter((w): w is number => w !== null);
  const earliest = positions.length ? Math.min(...positions) : 1;

  for (let n = 1; n <= weeks; n++) {
    out.push({
      number: n,
      athletes: mine.filter((a) => weekOf(a, weeks, today) === n),
      editable: n >= earliest,
    });
  }
  return out;
}
