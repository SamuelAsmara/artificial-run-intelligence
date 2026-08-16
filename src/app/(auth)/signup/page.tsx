import { LoginView } from "@/components/screens/LoginView";

export const metadata = { title: "Sign up · ARI" };

export default function SignupPage() {
  return <LoginView initialMode="signup" />;
}
