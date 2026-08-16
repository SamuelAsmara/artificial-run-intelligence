import { signOut } from "@/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="btn btn-secondary">
        Sign out
      </button>
    </form>
  );
}
