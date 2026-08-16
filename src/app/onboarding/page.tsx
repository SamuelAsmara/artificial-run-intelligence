import { redirect } from "next/navigation";

/**
 * The old onboarding screen is gone. Onboarding now lives in two designed
 * places: the zero-state and build-plan flow in LoginView, and the Strava
 * connect flow on Settings. Kept as a redirect so old links don't 404.
 */
export default function OnboardingPage() {
  redirect("/settings");
}
