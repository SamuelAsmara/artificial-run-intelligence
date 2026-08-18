/**
 * Pace and duration formatting.
 *
 * There is one subtlety worth having in a single place: you must round the
 * *total* number of seconds before splitting it into minutes and seconds.
 * Rounding the remainder instead produces "4:60" whenever the seconds part
 * lands above 59.5 — which is exactly what the activities table was showing.
 *
 *   wrong:  Math.floor(299.6 / 60) + ":" + Math.round(299.6 % 60)  ->  "4:60"
 *   right:  round to 300 first                                     ->  "5:00"
 */

/** Seconds per kilometre -> "5:24". Returns "—" for anything unusable. */
export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm === null || secPerKm === undefined) return "—";
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  return formatMinSec(secPerKm);
}

/** Seconds -> "m:ss", or "h:mm:ss" once it passes an hour. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const t = Math.round(seconds);
  if (t < 3600) return formatMinSec(t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Seconds -> "m:ss", with the carry handled correctly. */
export function formatMinSec(seconds: number): string {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Metres per second -> "5:24" per kilometre. */
export function speedToPace(mps: number | null | undefined): string {
  if (!mps || !Number.isFinite(mps) || mps <= 0) return "—";
  return formatPace(1000 / mps);
}
