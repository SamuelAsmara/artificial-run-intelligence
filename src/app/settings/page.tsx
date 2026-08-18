import { SettingsView } from "@/components/screens/SettingsView";
import { getIntervalsIcuConnection } from "@/actions/providers";
import { getAthleteProfile } from "@/actions/profile";

export const metadata = { title: "Settings · ARI" };

export default async function SettingsPage() {
  // Read on the server so the intervals.icu key never has to leave it — the
  // view only ever receives an athlete id, a four-character hint and a status.
  const [icuConnection, profile] = await Promise.all([
    getIntervalsIcuConnection(),
    getAthleteProfile(),
  ]);

  return <SettingsView icuConnection={icuConnection} profile={profile} />;
}
