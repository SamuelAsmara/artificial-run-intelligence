import { SettingsView } from "@/components/screens/SettingsView";
import { getIntervalsIcuConnection } from "@/actions/providers";
import { getAthleteProfile } from "@/actions/profile";
import { getMyCoach } from "@/actions/coach";

export const metadata = { title: "Settings · ARI" };

export default async function SettingsPage() {
  // Read on the server so the intervals.icu key never has to leave it — the
  // view only ever receives an athlete id, a four-character hint and a status.
  const [icuConnection, profile, coach] = await Promise.all([
    getIntervalsIcuConnection(),
    getAthleteProfile(),
    getMyCoach(),
  ]);

  return <SettingsView icuConnection={icuConnection} profile={profile} coach={coach} />;
}
