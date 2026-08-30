import { getCoachPreferences, getMyCoachCode } from "@/actions/coach";
import { getAthleteProfile } from "@/actions/profile";
import { getIntervalsIcuConnection } from "@/actions/providers";
import { CoachSettingsView } from "@/components/screens/CoachSettingsView";

export const metadata = { title: "Settings · Runi" };

/*
 * One settings page for a coach.
 *
 * The profile and the connection are read here now as well, because the page
 * renders them itself rather than sending the coach to a second settings
 * screen for the half that was missing. As on the athlete page, the
 * intervals.icu key is read on the server and never reaches the view — the
 * component receives a status and a four-character hint.
 */
export default async function CoachSettingsPage() {
  const [preferences, code, profile, icuConnection] = await Promise.all([
    getCoachPreferences(),
    getMyCoachCode(),
    getAthleteProfile(),
    getIntervalsIcuConnection(),
  ]);

  return (
    <CoachSettingsView
      preferences={preferences}
      code={code}
      email={profile?.email ?? null}
      profile={profile}
      icuConnection={icuConnection}
    />
  );
}
