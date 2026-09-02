import { redirect } from "next/navigation";

/*
 * The package chooser used to be a page of its own here. It now lives inside
 * Settings → Billing, where a coach can see the two packages and change
 * between them without leaving the page. The route stays so that old links
 * land in the right place.
 */
export default function UpgradePage() {
  redirect("/coach/settings#billing");
}
