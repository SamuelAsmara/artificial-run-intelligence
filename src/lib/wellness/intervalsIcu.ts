/**
 * intervals.icu wellness client.
 *
 * Why this exists: the Strava API exposes no sleep, heart-rate variability or
 * resting heart rate — four of the six inputs a Garmin readiness score uses are
 * structurally unavailable to us. Garmin's own Health API is enterprise-only
 * and currently closed to new applicants, so intervals.icu is the practical
 * route to an athlete's overnight data: they hold an official Garmin
 * connection and expose it through a free, documented API.
 *
 * Known limitation to record in the architecture doc: this makes recovery data
 * dependent on the athlete having an intervals.icu account with Garmin linked.
 * Upgrade path is a direct Garmin Health licence, or an aggregator such as
 * Terra, when there is budget.
 *
 * Auth: HTTP Basic, username literally `API_KEY`, password = the athlete's key.
 */

const BASE = "https://intervals.icu/api/v1";

/** Raw shape returned by intervals.icu. Every field is optional in practice. */
export interface IcuWellness {
  /** the date, YYYY-MM-DD — intervals.icu uses `id` for this */
  id: string;
  restingHR?: number | null;
  /** rMSSD, the vagal index the readiness literature uses */
  hrv?: number | null;
  hrvSDNN?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  sleepQuality?: number | null;
  avgSleepingHR?: number | null;
  weight?: number | null;
  steps?: number | null;
  spO2?: number | null;
  /** subjective, 1–4 scales when the athlete fills them in */
  soreness?: number | null;
  fatigue?: number | null;
  stress?: number | null;
  mood?: number | null;
  motivation?: number | null;
  /** intervals.icu's own fitness numbers — we compute our own, but useful to compare */
  ctl?: number | null;
  atl?: number | null;
  rampRate?: number | null;
}

export class IntervalsIcuError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "IntervalsIcuError";
  }
}

function authHeader(apiKey: string): string {
  // Node and the edge runtime both have btoa; Buffer would tie us to Node.
  return "Basic " + btoa(`API_KEY:${apiKey}`);
}

export interface IcuConfig {
  apiKey: string;
  athleteId: string;
}

/** Reads config from the environment, or null when it isn't configured. */
export function icuConfigFromEnv(): IcuConfig | null {
  const apiKey = process.env.INTERVALS_ICU_API_KEY;
  const athleteId = process.env.INTERVALS_ICU_ATHLETE_ID;
  if (!apiKey || !athleteId) return null;
  return { apiKey, athleteId };
}

/**
 * Daily wellness rows between two dates, inclusive.
 *
 * Days the athlete's watch didn't record are simply absent from the response —
 * they are not returned as nulls — so callers must not assume a contiguous
 * series.
 */
export async function fetchWellness(
  cfg: IcuConfig,
  oldest: string,
  newest: string,
): Promise<IcuWellness[]> {
  const url =
    `${BASE}/athlete/${encodeURIComponent(cfg.athleteId)}/wellness.json` +
    `?oldest=${oldest}&newest=${newest}`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
    /*
     * No cache. This used to be `next: { revalidate: 3600 }` on the reasoning
     * that wellness changes once a day — true of the data, false of the moment
     * it arrives. The oldest/newest range is stable for a whole calendar day,
     * so the cache key was too, and pressing "Sync now" at 08:05 after the
     * watch uploaded at 08:00 replayed the 07:20 response: "Synced 84 nights",
     * and not one figure on the dashboard moved. A button that says Sync now
     * must actually go and look.
     */
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new IntervalsIcuError(
      "intervals.icu rejected the API key. Check INTERVALS_ICU_API_KEY.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new IntervalsIcuError(
      `intervals.icu returned ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as IcuWellness[]) : [];
}

/**
 * Checks a key/athlete-id pair by asking intervals.icu who it belongs to.
 *
 * Used by the Settings screen before storing anything, so the athlete finds out
 * immediately that they pasted the wrong value rather than a week later when
 * their readiness score silently stops updating.
 *
 * Returns the athlete's display name on success — showing it back to them is
 * the clearest possible confirmation that the right account is connected.
 */
export async function verifyCredentials(
  cfg: IcuConfig,
): Promise<{ ok: true; name: string | null } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/athlete/${encodeURIComponent(cfg.athleteId)}`, {
      headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "Could not reach intervals.icu. Try again in a moment." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "intervals.icu rejected that key. Check you copied all of it." };
  }
  if (res.status === 404) {
    return { ok: false, reason: "No athlete with that ID. It looks like i123456 — including the i." };
  }
  if (!res.ok) {
    return { ok: false, reason: `intervals.icu returned ${res.status}. Try again shortly.` };
  }

  let name: string | null = null;
  try {
    const body = (await res.json()) as { name?: string; firstname?: string };
    name = body.name ?? body.firstname ?? null;
  } catch {
    // A 200 with an unreadable body still proves the credentials work.
  }
  return { ok: true, name };
}

/**
 * Normalises what the athlete pastes.
 *
 * intervals.icu shows the athlete id as `i123456` on the settings page, but
 * people paste it in every other form: with the `i`, without it, with the full
 * profile URL around it, with a stray space. Accept all of them.
 */
export function normaliseAthleteId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // pull the id out of a pasted URL such as https://intervals.icu/athlete/i123456/...
  const fromUrl = trimmed.match(/athlete\/(i?\d+)/i);
  const candidate = (fromUrl ? fromUrl[1] : trimmed).replace(/\s+/g, "");

  const digits = candidate.match(/^i?(\d{2,})$/i);
  if (!digits) return null;
  return `i${digits[1]}`;
}

/** Last four characters, for showing which key is stored without revealing it. */
export function apiKeyHint(apiKey: string): string {
  const t = apiKey.trim();
  return t.length <= 4 ? "\u2022".repeat(t.length) : t.slice(-4);
}

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */

/**
 * Why we pull activities from here as well as wellness.
 *
 * intervals.icu is itself an aggregator: the athlete connects Garmin, Strava,
 * Polar, Coros or Wahoo *there*, and it holds the merged history. Taking
 * activities from the same connection that already gives us sleep and
 * heart-rate variability means one credential covers the whole picture, rather
 * than making every athlete authorise two services to get one dashboard.
 *
 * The trade-off is a hard dependency on a single third party, which belongs in
 * the architecture document rather than hidden in a comment.
 */
export interface IcuActivity {
  id?: string;
  /** local start time, e.g. "2026-08-17T06:12:00" */
  start_date_local?: string;
  type?: string;
  /** metres */
  distance?: number;
  /** seconds, excluding pauses */
  moving_time?: number;
  elapsed_time?: number;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  calories?: number | null;
  /** one foot per minute, as Garmin counts it */
  average_cadence?: number | null;
  average_watts?: number | null;
  icu_average_watts?: number | null;
  /** running power, which intervals.icu reports separately from bike watts */
  icu_weighted_avg_watts?: number | null;
  /**
   * When intervals.icu last modified this activity.
   *
   * The tell that an athlete cropped a run, corrected its type, or re-uploaded
   * the file after we already analysed it — see migration 0015. Absent on older
   * responses, which is why everything downstream treats null as "unknown"
   * rather than "unchanged".
   */
  updated?: string | null;
  name?: string;
}

/** Activities between two dates, inclusive. Newest first is not guaranteed. */
export async function fetchActivities(
  cfg: IcuConfig,
  oldest: string,
  newest: string,
): Promise<IcuActivity[]> {
  const url =
    `${BASE}/athlete/${encodeURIComponent(cfg.athleteId)}/activities` +
    `?oldest=${oldest}&newest=${newest}`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new IntervalsIcuError("intervals.icu rejected the API key.", res.status);
  }
  if (!res.ok) {
    throw new IntervalsIcuError(
      `intervals.icu returned ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as IcuActivity[]) : [];
}

/** A row of the `activities` table, without the user id. */
export interface ActivityImport {
  source: "intervals_icu";
  external_id: string;
  type: string | null;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  /** steps per minute, both feet */
  avg_cadence: number | null;
  avg_power: number | null;
  started_at: string | null;
  /** when the provider last modified it, if it says — see migration 0015 */
  source_updated_at: string | null;
}

/**
 * Keeps runs and drops everything else.
 *
 * The load model is calibrated on running: its heart-rate-to-load curve and its
 * threshold pace mean nothing for a swim, and counting a bike ride as a run
 * would inflate fitness while telling the athlete nothing useful. Rides still
 * cost real fatigue, so excluding them understates load for a cross-training
 * athlete — a known limitation, not an oversight.
 */
/**
 * Average power, from whichever field this activity happens to carry.
 *
 * intervals.icu exposes the device's own figure as `average_watts` and its
 * recomputed one as `icu_average_watts`, and which of the two is present
 * depends on the source. Preferring the device's keeps our number matching what
 * the athlete sees on their watch.
 */
/**
 * Average power, from whichever field this activity happens to carry it in.
 *
 * intervals.icu does not use one name. Bike files land in `average_watts`;
 * running power arrives as `icu_average_watts` or `icu_weighted_avg_watts`
 * depending on the source device and how the file was processed. Reading only
 * the first two is why `avg_power` has been null on every imported run.
 *
 * Still cosmetic — nothing in the load model uses power, which is scored from
 * heart rate and pace — so this is widened rather than made a hard requirement.
 */
function pickWatts(a: IcuActivity): number | null {
  for (const w of [a.average_watts, a.icu_average_watts, a.icu_weighted_avg_watts]) {
    if (typeof w === "number" && w > 0) return Math.round(w);
  }
  return null;
}

export function toActivityImports(rows: IcuActivity[]): ActivityImport[] {
  const out: ActivityImport[] = [];
  const seen = new Set<string>();

  for (const a of rows) {
    const isRun = (a.type ?? "").toLowerCase().includes("run");
    const duration = a.moving_time ?? a.elapsed_time ?? 0;
    if (!isRun || duration <= 0) continue;

    const externalId = a.id ?? (a.start_date_local ? `t-${a.start_date_local}` : null);
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);

    out.push({
      source: "intervals_icu",
      external_id: externalId,
      type: a.type ?? "Run",
      distance_m: typeof a.distance === "number" ? Math.round(a.distance) : null,
      duration_s: Math.round(duration),
      avg_hr:
        typeof a.average_heartrate === "number" && a.average_heartrate > 0
          ? Math.round(a.average_heartrate)
          : null,
      max_hr:
        typeof a.max_heartrate === "number" && a.max_heartrate > 0
          ? Math.round(a.max_heartrate)
          : null,
      calories:
        typeof a.calories === "number" && a.calories > 0 ? Math.round(a.calories) : null,
      // Garmin counts one foot; every number a coach quotes counts both.
      avg_cadence:
        typeof a.average_cadence === "number" && a.average_cadence > 0
          ? Math.round(a.average_cadence * 2)
          : null,
      avg_power: pickWatts(a),
      started_at: a.start_date_local ? new Date(a.start_date_local).toISOString() : null,
      source_updated_at: a.updated ? new Date(a.updated).toISOString() : null,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Mapping into our own model                                          */
/* ------------------------------------------------------------------ */

/** Matches the `recovery_signals` table. */
export interface RecoverySignal {
  date: string;
  sleepHours: number | null;
  restingHr: number | null;
  hrv: number | null;
  source: "webhook" | "derived";
}

export function toRecoverySignals(rows: IcuWellness[]): RecoverySignal[] {
  return rows.map((r) => ({
    date: r.id,
    sleepHours: r.sleepSecs != null ? r.sleepSecs / 3600 : null,
    restingHr: r.restingHR ?? null,
    hrv: r.hrv ?? null,
    source: "webhook",
  }));
}

/**
 * Last night's heart-rate variability as a percentage of the athlete's own
 * recent baseline.
 *
 * Absolute HRV is meaningless across people — a value of 40 ms can be excellent
 * for one runner and poor for another — so readiness must compare an athlete
 * against themselves. We use a 7-day rolling mean, which is the smoothing the
 * literature recommends (Plews et al. 2014: a single day is noise-dominated,
 * and at least 3 valid days a week are needed for the mean to mean anything).
 *
 * Returns null rather than guessing when there are fewer than 3 valid nights.
 */
export function hrvVsBaselinePct(
  signals: RecoverySignal[],
  asOf: string,
): number | null {
  const sorted = [...signals]
    .filter((s) => s.hrv != null && s.date <= asOf)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = sorted[0];
  if (!latest) return null;
  // A baseline comparison against a reading from months ago is not a
  // comparison — see RECOVERY_STALE_DAYS.
  if (Math.round((Date.parse(asOf) - Date.parse(latest.date)) / 86_400_000) > RECOVERY_STALE_DAYS) {
    return null;
  }

  const baselineWindow = sorted.slice(0, 8).slice(1); // the 7 nights before it
  const valid = baselineWindow.filter((s) => s.hrv != null);
  if (valid.length < 3) return null;

  const baseline = valid.reduce((sum, s) => sum + (s.hrv as number), 0) / valid.length;
  if (baseline <= 0) return null;

  return ((latest.hrv as number) / baseline) * 100;
}

/**
 * How stale a recovery reading may be before it stops counting.
 *
 * A watch missed for a night or two should carry forward — sleep does not
 * become unknowable because somebody forgot to charge something. Beyond that it
 * is not a measurement of anything current. Without this bound an athlete who
 * stopped wearing their watch in April had April's 6.2 hours resolved in
 * August, narrated as "you slept 6.2 hours last night", and — worse — it
 * switched the readiness model into its with-recovery weighting on the strength
 * of a four-month-old number.
 */
export const RECOVERY_STALE_DAYS = 3;

const daysApart = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * Most recent night's sleep, in hours.
 *
 * Null when it was not recorded, and null when the most recent record is older
 * than `RECOVERY_STALE_DAYS` — silence is the honest answer, and every consumer
 * already handles it.
 */
export function latestSleepHours(
  signals: RecoverySignal[],
  asOf: string,
): number | null {
  const sorted = [...signals]
    .filter((s) => s.sleepHours != null && s.date <= asOf)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = sorted[0];
  if (!latest) return null;
  if (daysApart(latest.date, asOf) > RECOVERY_STALE_DAYS) return null;

  return latest.sleepHours ?? null;
}
