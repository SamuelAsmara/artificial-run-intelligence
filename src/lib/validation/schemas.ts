import { z } from "zod";
import { todayIso } from "@/lib/time/week";

const MAX_RACE_HORIZON_DAYS = 365 * 2;

/** Technical design §9: a race date in the future and within a sensible horizon (two years). */
export const goalRaceSchema = z.object({
  raceType: z.enum(["5k", "10k", "half", "full"]),
  raceDate: z
    .string()
    .date()
    .refine((v) => v > todayIso(), { message: "The race date has to be in the future." })
    .refine((v) => {
      const h = new Date();
      h.setDate(h.getDate() + MAX_RACE_HORIZON_DAYS);
      return new Date(v) <= h;
    }, { message: "The race date is too far out — up to two years ahead." }),
  targetTime: z.string().optional(),
});
export type GoalRaceInput = z.infer<typeof goalRaceSchema>;

export const healthWebhookSchema = z.object({
  date: z.string().date(),
  sleepHours: z.number().min(0).max(24).optional(),
  restingHr: z.number().int().min(20).max(220).optional(),
  hrv: z.number().min(0).max(300).optional(),
});
export type HealthWebhookInput = z.infer<typeof healthWebhookSchema>;

/**
 * A coach's edit to one planned session. The type is the closed set the
 * product knows, the distance is metres within a day's reach, and the pace is
 * "m:ss" per kilometre. `null` clears a field; `undefined` leaves it alone.
 */
export const workoutPatchSchema = z.object({
  workoutType: z.enum(["easy", "interval", "long", "rest"]).optional(),
  plannedDistanceM: z.number().int().min(0).max(100_000).nullable().optional(),
  plannedPace: z.string().regex(/^\d{1,2}:\d{2}$/, "Pace looks like 5:20").nullable().optional(),
});
export type WorkoutPatch = z.infer<typeof workoutPatchSchema>;
