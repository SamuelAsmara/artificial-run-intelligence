import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStravaAuthorizeUrl } from "@/lib/strava/api";
import { SignOutButton } from "@/components/SignOutButton";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conn } = await supabase
    .from("strava_connections")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const connected = !!conn;
  const authorizeUrl = getStravaAuthorizeUrl(user.id);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold text-[#1F3864]">ברוך הבא ל-Artificial Run Intelligence</h1>
      {connected ? (
        <>
          <p className="text-green-600">Strava מחובר ✓</p>
          <Link href="/plan" className="rounded-lg bg-[#2E5A94] px-5 py-2.5 font-medium text-white">
            המשך להגדרת מרוץ יעד
          </Link>
        </>
      ) : (
        <>
          <p className="max-w-md text-neutral-500">
            כדי להתחיל, חבר את חשבון ה-Strava שלך. משם נמשוך את האימונים ונבנה את התמונה.
          </p>
          <a href={authorizeUrl} className="rounded-lg bg-[#FC4C02] px-5 py-2.5 font-medium text-white">
            התחבר עם Strava
          </a>
        </>
      )}
      <SignOutButton />
    </main>
  );
}
