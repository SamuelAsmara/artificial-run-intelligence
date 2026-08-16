import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold text-[#1F3864]">הרשמה</h1>
      <AuthForm mode="signup" />
    </main>
  );
}
