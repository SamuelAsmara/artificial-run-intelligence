import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SyncButton } from "@/components/SyncButton";
import { SignOutButton } from "@/components/SignOutButton";

function fmtPace(distanceM: number | null, durationS: number | null): string {
  if (!distanceM || !durationS || distanceM === 0) return "—";
  const secPerKm = durationS / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /ק"מ`;
}

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1F3864]">האימונים שלי</h1>
        <SignOutButton />
      </header>

      <SyncButton />

      {!activities || activities.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          עדיין אין אימונים. לחץ &quot;סנכרן עכשיו&quot; כדי למשוך מ-Strava.{" "}
          <Link href="/onboarding" className="text-[#2E5A94] underline">חיבור Strava</Link>
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#2E5A94] text-white">
              <tr>
                <th className="p-3 font-medium">תאריך</th>
                <th className="p-3 font-medium">סוג</th>
                <th className="p-3 font-medium">מרחק</th>
                <th className="p-3 font-medium">זמן</th>
                <th className="p-3 font-medium">קצב</th>
                <th className="p-3 font-medium">דופק</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id} className="border-t border-neutral-100">
                  <td className="p-3">{a.started_at ? new Date(a.started_at).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="p-3">{a.type ?? "—"}</td>
                  <td className="p-3">{a.distance_m ? (a.distance_m / 1000).toFixed(2) + " ק\"מ" : "—"}</td>
                  <td className="p-3">{a.duration_s ? Math.round(a.duration_s / 60) + " דק'" : "—"}</td>
                  <td className="p-3">{fmtPace(a.distance_m, a.duration_s)}</td>
                  <td className="p-3">{a.avg_hr ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
