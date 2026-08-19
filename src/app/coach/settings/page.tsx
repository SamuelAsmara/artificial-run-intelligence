import { getCoachPreferences, getMyCoachCode } from "@/actions/coach";
import { getAthleteProfile } from "@/actions/profile";
import { CoachSettingsView } from "@/components/screens/CoachSettingsView";

export const metadata = { title: "Coach settings · ARI" };

export default async function CoachSettingsPage() {
  const [preferences, code, profile] = await Promise.all([
    getCoachPreferences(),
    getMyCoachCode(),
    getAthleteProfile(),
  ]);

  return <CoachSettingsView preferences={preferences} code={code} email={profile?.email ?? null} />;
}
