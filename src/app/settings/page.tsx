/**
 * Settings. The intervals.icu key is read on the server and never reaches the
 * view — the component receives a status and a four-character hint.
 */

import { SettingsView } from "@/components/screens/SettingsView";
import { getIntervalsIcuConnection } from "@/actions/providers";
import { getAthleteProfile } from "@/actions/profile";
import { getMyCoach } from "@/actions/coach";
import { getPlanScreen } from "@/actions/plan";
import { getAthletePlan } from "@/actions/billing";
import { isCoach } from "@/lib/auth/role";
import { RACE_LABEL } from "@/lib/coach/templates";
import type { RaceType } from "@/types/database.types";

export const metadata = { title: "Settings · Runi" };

export default async function SettingsPage() {
  // Read on the server so the intervals.icu key never has to leave it — the
  // view only ever receives an athlete id, a four-character hint and a status.
  const [icuConnection, profile, coach, planScreen, billingPlan, isCoachAccount] = await Promise.all([
    getIntervalsIcuConnection(),
    getAthleteProfile(),
    getMyCoach(),
    getPlanScreen(),
    getAthletePlan(),
    isCoach(),
  ]);

  const plan = planScreen.plan
    ? { title: planScreen.planMeta?.own ? planScreen.planMeta.name ?? "Your plan" : planScreen.race ? `${RACE_LABEL[planScreen.race.raceType as RaceType] ?? "Race"} plan` : "Training plan", weeks: planScreen.plan.weeks.length }
    : null;

  return <SettingsView icuConnection={icuConnection} profile={profile} coach={coach} plan={plan} billingPlan={billingPlan} isCoachAccount={isCoachAccount} />;
}
