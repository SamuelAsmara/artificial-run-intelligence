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
      {/*
        Styled as what it is.
        
        It sat in the same neutral grey as "Save changes" and "Connect", so the
        one control that throws away your session looked exactly like the ones
        that keep your work. Destructive actions should announce themselves.
      */}
      <button
        type="submit"
        className="btn"
        style={{
          background: "transparent",
          border: "1px solid var(--color-negative)",
          color: "var(--color-negative)",
        }}
      >
        Sign out
      </button>
    </form>
  );
}
