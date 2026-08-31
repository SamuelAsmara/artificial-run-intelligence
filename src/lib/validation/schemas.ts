import { z } from "zod";

const MAX_RACE_HORIZON_DAYS = 365 * 2;

/** מסמך תכנון טכני §9: תאריך מרוץ עתידי ובטווח סביר (עד שנתיים). */
export const goalRaceSchema = z.object({
  raceType: z.enum(["5k", "10k", "half", "full"]),
  raceDate: z
    .string()
    .date()
    .refine((v) => new Date(v) > new Date(), { message: "The race date has to be in the future." })
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
