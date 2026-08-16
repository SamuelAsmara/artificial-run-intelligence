import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold text-[#1F3864]">Artificial Run Intelligence</h1>
      <p className="max-w-md text-neutral-500">
        מאמן ריצה חכם: תכנון תוכנית קדימה, מודעות להתאוששות, וליווי מאמן — עם חוויה נקייה וברורה.
      </p>
      <div className="flex gap-3">
        {user ? (
          <Link href="/activities" className="rounded-lg bg-[#2E5A94] px-5 py-2.5 font-medium text-white">
            לאימונים שלי
          </Link>
        ) : (
          <>
            <Link href="/login" className="rounded-lg bg-[#2E5A94] px-5 py-2.5 font-medium text-white">התחברות</Link>
            <Link href="/signup" className="rounded-lg border border-[#2E5A94] px-5 py-2.5 font-medium text-[#2E5A94]">הרשמה</Link>
          </>
        )}
      </div>
    </main>
  );
}
