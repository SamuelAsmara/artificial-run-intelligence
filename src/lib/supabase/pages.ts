/**
 * PostgREST returns at most a thousand rows and says nothing about the rest.
 *
 * ## The bug this exists to stop
 *
 * The coach workspace read a roster's worth of sessions with a plain
 * `.in(...).gte(...).lte(...)` and no range. With one athlete that returns
 * everything; with twenty it returns the first thousand of about fourteen
 * hundred, silently, and with no `order by` it is not even defined *which*
 * thousand. The board then showed 32 sessions in a week where there were 80,
 * eight sessions on a Thursday where there were twenty, and — the part that
 * actually hurts — left the athlete with the most missed sessions off the
 * "needs you" list entirely, because his rows were among the ones dropped.
 *
 * The cycles screen had the same read in a different shape: every session of
 * every member, to work out which week each one is on. Past about eight
 * members the last plans lost their rows and showed "no plan yet" next to an
 * athlete whose plan was there — or "week 2 of 2" for a fourteen-week plan
 * whose first two weeks happened to fit under the cap.
 *
 * Nothing errored. The screen was simply wrong, and looked fine.
 *
 * ## Why paging rather than a smaller query
 *
 * Both screens genuinely need every row in the window. Aggregating in
 * Postgres would be faster still and is the right end state, but it means a
 * new RPC and a migration, and this is the fix that makes the numbers correct
 * today without changing the shape of anything.
 *
 * The caller's explicit `order` is not decoration — paging without a total
 * order can repeat or skip rows between pages.
 */
export const PAGE = 1000;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
    // A roster large enough to need more than this has other problems; the
    // guard is here so a bad filter can never spin forever.
    if (out.length >= PAGE * 50) break;
  }
  return out;
}
