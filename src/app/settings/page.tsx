import { SettingsView } from "@/components/screens/SettingsView";
import { getIntervalsIcuConnection } from "@/actions/providers";

export const metadata = { title: "Settings · ARI" };

export default async function SettingsPage() {
  // Read on the server so the API key never has to leave it — the view only
  // ever receives the athlete id, a four-character hint and a status.
  const icuConnection = await getIntervalsIcuConnection();
  return <SettingsView icuConnection={icuConnection} />;
}
