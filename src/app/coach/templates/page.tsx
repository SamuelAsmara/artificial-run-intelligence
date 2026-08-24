import { getCoachTemplates, getCoachWorkspace } from "@/actions/coach";
import { CoachTemplatesView } from "@/components/screens/CoachTemplatesView";
import { todayIso } from "@/lib/time/week";

export const metadata = { title: "Templates · ARI" };

export default async function CoachTemplatesPage() {
  /*
   * The roster comes with the templates now.
   *
   * A template is week 1 to week N with no dates, and the question a coach
   * actually has in front of it is "who does changing this reach?". Answering
   * that needs the athletes and their race dates, so both are read here and
   * the week strip is computed on the client from the two together.
   */
  const [templates, workspace] = await Promise.all([
    getCoachTemplates(),
    getCoachWorkspace(),
  ]);

  return (
    <CoachTemplatesView
      templates={templates}
      // `getCoachWorkspace` returns null for a signed-out or non-coach caller;
      // the strip then simply shows an empty programme rather than throwing.
      athletes={(workspace?.athletes ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        raceType: a.raceType,
        raceDate: a.raceDate,
      }))}
      today={todayIso()}
    />
  );
}
