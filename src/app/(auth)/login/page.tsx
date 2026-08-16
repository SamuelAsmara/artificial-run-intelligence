import { LoginView } from "@/components/screens/LoginView";

export const metadata = { title: "Log in · ARI" };

export default function LoginPage() {
  return <LoginView initialMode="login" />;
}
