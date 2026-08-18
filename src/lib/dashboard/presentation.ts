/**
 * How the dashboard looks, separated from what it shows.
 *
 * ## Why this file exists
 *
 * The reference dataset in `model.ts` encoded two different things at once:
 * invented numbers, and the *rules for presenting* them — that a completed
 * session is accent blue, a missed one is red, this week's volume bar is amber
 * while past weeks are solid and future weeks are hollow, that a fresh record
 * is gold.
 *
 * Those rules are design decisions from the Claude Design handoff. The numbers
 * were placeholders. Replacing placeholders with real data must not take the
 * rules with them, or the next time data arrives someone re-invents how it
 * should look — which is exactly how the first port came out generic.
 *
 * So every rule lives here, named, once. The reference dataset and the real
 * pipeline both call these. Neither can drift from the other, because there is
 * only one of each.
 *
 * **Nothing in this file may consult data.** It maps a state to an appearance.
 */

/* ------------------------------------------------------------------ */
/* Calendar dots                                                       */
/* ------------------------------------------------------------------ */

export type DayState = "done" | "missed" | "planned" | "rest";

/**
 * The dot under a date. Rest days carry no dot at all — an empty day is the
 * plan working, not a gap in it.
 */
export function calendarDotColor(state: DayState): string | null {
  switch (state) {
    case "done":
      return "var(--color-accent)";
    case "missed":
      return "var(--color-negative)";
    case "planned":
      return "var(--color-caution)";
    case "rest":
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Weekly volume bars                                                  */
/* ------------------------------------------------------------------ */

export type WeekPosition = "past" | "current" | "future";

/** Tallest bar in the strip, in pixels. Fixed by the design's 76px box. */
export const VOLUME_BAR_MAX_H = 72;
/** Even an empty week keeps a sliver, so the strip reads as twelve weeks. */
export const VOLUME_BAR_MIN_H = 6;

export interface BarAppearance {
  bg: string;
  border: string;
}

/**
 * Past weeks are solid — they happened. The current week is amber, the same
 * colour the plan strip uses for "planned", because it is partly still ahead.
 * Future weeks are hollow outlines: shape without substance.
 */
export function volumeBarAppearance(position: WeekPosition): BarAppearance {
  switch (position) {
    case "past":
      return { bg: "var(--color-accent)", border: "transparent" };
    case "current":
      return { bg: "var(--color-caution)", border: "transparent" };
    case "future":
      return { bg: "var(--color-elevated)", border: "var(--color-line-strong)" };
  }
}

/** Height in pixels for a week's volume against the tallest week in view. */
export function volumeBarHeight(km: number, maxKm: number): number {
  if (!Number.isFinite(km) || km <= 0 || maxKm <= 0) return VOLUME_BAR_MIN_H;
  return Math.max(VOLUME_BAR_MIN_H, Math.round((km / maxKm) * VOLUME_BAR_MAX_H));
}

/** @param isoWeek the calendar week of the year, not a position in the strip */
export function volumeBarTitle(isoWeek: number, km: number, position: WeekPosition): string {
  const suffix =
    position === "past" ? " · done" : position === "current" ? " · this week" : " · planned";
  return `Week ${isoWeek} · ${Math.round(km)} km${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Missing values                                                      */
/* ------------------------------------------------------------------ */

/**
 * What a number looks like when there isn't one.
 *
 * An em-dash in the same typography as the value it replaces, so the layout
 * holds its shape and the reader can see that a slot exists and is empty —
 * rather than the element vanishing and the page silently reflowing.
 */
export const NO_VALUE = "—";

/** Tone for a slot with no data: present, but plainly inactive. */
export const NO_VALUE_TONE = "var(--color-faint)";

/* ------------------------------------------------------------------ */
/* Personal records                                                    */
/* ------------------------------------------------------------------ */

/** A record set recently is gold; an older one is quiet. */
export const prNoteColor = (isNew: boolean): string =>
  isNew ? "var(--color-gold)" : "var(--color-faint)";

/** The band's columns are divided from each other, but not led by a divider. */
export const prDivider = (index: number): string =>
  index === 0 ? "transparent" : "var(--color-line)";

/* ------------------------------------------------------------------ */
/* Metric tiles                                                        */
/* ------------------------------------------------------------------ */

/**
 * Tone for a tile's interpretation line.
 *
 * `good` and `caution` are the only two judgements the design makes; anything
 * we cannot judge is `neutral` rather than optimistically green.
 */
export type Judgement = "good" | "caution" | "neutral";

export function tileTone(judgement: Judgement): string {
  switch (judgement) {
    case "good":
      return "var(--color-positive)";
    case "caution":
      return "var(--color-caution)";
    case "neutral":
      return "var(--color-muted)";
  }
}
