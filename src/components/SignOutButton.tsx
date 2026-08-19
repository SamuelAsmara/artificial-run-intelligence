import { signOut } from "@/actions/auth";

/**
 * Signing out.
 *
 * This component and the action behind it both existed for weeks and were
 * rendered nowhere, so the application had no way out of itself: once signed
 * in, the only exit was clearing cookies by hand. Found because somebody tried
 * to use the product rather than read the code, which is how this class of
 * thing is always found.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="btn btn-secondary">
        Sign out
      </button>
    </form>
  );
}
