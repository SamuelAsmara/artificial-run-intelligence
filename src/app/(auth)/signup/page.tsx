import { Suspense } from "react";
import { LoginView } from "@/components/screens/LoginView";

export const metadata = { title: "Sign up · ARI" };

/**
 * Wrapped in Suspense because LoginView reads `?redirectTo=` — the destination
 * the middleware saved when it bounced a signed-out visitor. `useSearchParams`
 * opts a route out of static prerendering unless there is a boundary for it to
 * bail out to, and this page is otherwise entirely static.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginView initialMode="signup" />
    </Suspense>
  );
}
