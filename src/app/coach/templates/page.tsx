import { getCoachTemplates } from "@/actions/coach";
import { CoachTemplatesView } from "@/components/screens/CoachTemplatesView";

export const metadata = { title: "Templates · ARI" };

export default async function CoachTemplatesPage() {
  const templates = await getCoachTemplates();
  return <CoachTemplatesView templates={templates} />;
}
