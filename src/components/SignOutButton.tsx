import { signOut } from "@/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="text-sm text-neutral-500 underline">התנתקות</button>
    </form>
  );
}
