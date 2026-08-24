/**
 * The rules behind the day cell (kit item 3) — the most reused element in the
 * product: the plan week strip, the dashboard week, the coach's board and the
 * calendar all draw the same cell.
 *
 * Colour carries meaning here, so the mapping lives in one tested place rather
 * than being retyped on four screens.
 */

export type SessionType = "easy" | "tempo" | "intervals" | "long" | "rest";

export type DayState =
  | "done"
  | "missed"
  | "today"
  | "planned"
  | "rest"
  | "empty"
  /** a session the coach changed after it was published — must look different */
  | "adjusted";

/** the leading edge of the cell says what kind of session it is */
export const SESSION_EDGE: Record<SessionType, string> = {
  easy: "var(--color-positive)",
  tempo: "var(--color-caution)",
  intervals: "var(--color-accent)",
  long: "var(--color-atl)",
  rest: "var(--color-faint)",
};

export type DayCellStyle = {
  bg: string;
  /** inset, never an outer border — selection must not move the layout */
  ring: string;
  opacity: number;
  dayColor: string;
  statusColor: string;
  nameColor: string;
  statusLabel: string;
};

export function dayCellStyle(state: DayState): DayCellStyle {
  const base: DayCellStyle = {
    bg: "var(--color-surface)",
    ring: "inset 0 0 0 1px var(--color-line)",
    opacity: 1,
    dayColor: "var(--color-faint)",
    statusColor: "var(--color-faint)",
    nameColor: "var(--color-ink)",
    statusLabel: state,
  };

  switch (state) {
    case "done":
      return { ...base, statusColor: "var(--color-positive)" };
    case "missed":
      // dimmed, not deleted — a missed session is still part of the week
      return {
        ...base,
        statusColor: "var(--color-negative)",
        nameColor: "var(--color-faint)",
        opacity: 0.75,
      };
    case "adjusted":
      return {
        ...base,
        statusColor: "var(--color-caution)",
        ring: "inset 0 0 0 1px var(--color-caution)",
      };
    case "today":
      return {
        ...base,
        bg: "var(--color-accent-soft)",
        ring: "inset 0 0 0 1px var(--color-accent)",
        dayColor: "var(--color-accent)",
        statusColor: "var(--color-accent)",
      };
    case "rest":
      return { ...base, nameColor: "var(--color-faint)" };
    case "empty":
      return {
        ...base,
        bg: "transparent",
        nameColor: "var(--color-faint)",
        opacity: 0.6,
        statusLabel: "",
      };
    case "planned":
    default:
      return base;
  }
}
