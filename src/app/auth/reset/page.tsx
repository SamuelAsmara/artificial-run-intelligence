import { Suspense } from "react";
import { ResetPasswordView } from "@/components/screens/ResetPasswordView";

export const metadata = { title: "Set a new password · Runi" };

/**
 * Where a password-recovery link lands.
 *
 * Before this existed, "Forgot password?" was a dead end. The email was sent,
 * Supabase verified the token, and the user arrived somewhere with a session
 * but no screen anywhere that let them set a new password — the only
 * password-change UI is on Settings, and it re-authenticates with the password
 * they had just told us they had forgotten. Account recovery was impossible by
 * any route.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordView />
    </Suspense>
  );
}
