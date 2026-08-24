/**
 * A calendar month as seven columns.
 *
 * The plan already reads as month → week → day, but only as an accordion: you
 * see one week at a time and the shape of the month is something you have to
 * hold in your head. This lays the same days out as a grid so the shape is
 * visible — where the long runs fall, how the hard days are spaced, which week
 * is light.
 *
 * Monday-first, like every other week in the product.
 *
 * Dates are handled as strings wherever possible. Parsing a plan date into a
 * `Date` and reading `getMonth()` back out is how a plan generated in one
 * timezone comes to show a Sunday session on the previous Saturday.
 */

export type MonthCell<T> = {
  /** ISO date, always — including the days that spill in from either side */
  iso: string;
  dayOfMonth: number;
  /** false for the days borrowed from the previous or next month */
  inMonth: boolean;
  /** the plan day that falls here, when there is one */
  item: T | null;
};

export type MonthGrid<T> = {
  /** "2026-08" */
  month: string;
  /** always a multiple of seven; five or six rows depending on the month */
  cells: MonthCell<T>[];
  rows: number;
};

/** Monday = 0, so the grid starts where the product's weeks start. */
function mondayIndex(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  return (d.getDay() + 6) % 7;
}

function shift(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(y, m, 0).getDate();
}

/**
 * @param month "YYYY-MM"
 * @param items anything carrying an ISO `date`; the last one wins on a clash
 */
export function monthGrid<T extends { date: string }>(
  month: string,
  items: T[],
): MonthGrid<T> {
  const first = `${month}-01`;
  const total = daysInMonth(month);
  const lead = mondayIndex(first);

  // Enough whole weeks to hold the lead-in and every day of the month.
  const rows = Math.ceil((lead + total) / 7);

  const byDate = new Map<string, T>();
  for (const item of items) byDate.set(item.date, item);

  const cells: MonthCell<T>[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const iso = shift(first, i - lead);
    cells.push({
      iso,
      dayOfMonth: Number(iso.slice(8, 10)),
      inMonth: iso.slice(0, 7) === month,
      item: byDate.get(iso) ?? null,
    });
  }

  return { month, cells, rows };
}

/** The distinct months a set of dated items spans, in order, as "YYYY-MM". */
export function monthsOf(items: { date: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const m = i.date.slice(0, 7);
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out.sort();
}
