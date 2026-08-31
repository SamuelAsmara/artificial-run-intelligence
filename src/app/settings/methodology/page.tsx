import { redirect } from "next/navigation";

/**
 * The formulas used to live here as a page of prose. They are now the
 * Numbers board at /numbers — same figures, on the athlete's own data. The
 * old address keeps working for the documents and anyone who bookmarked it.
 */
export default function MethodologyRedirect() {
  redirect("/numbers");
}
