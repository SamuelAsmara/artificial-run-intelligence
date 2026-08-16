import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoalRaceForm } from "@/components/GoalRaceForm";
import { SignOutButton } from "@/components/SignOutButton";

const RACE_LABELS: Record<string, string> = { "5k": "5 ק\"מ", "10k": "10 ק\"מ", half: "חצי מרתון", full: "מרתון" };
const TYPE_LABELS: Record<string, string> = { easy: "קל", interval: "אינטרוולים", long: "ארוך", rest: "מנוחה" };
const TYPE_COLORS: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-800",
  interval: "bg-orange-100 text-orange-800",
  long: "bg-blue-100 text-blue-800",
  rest: "bg-neutral-100 text-neutral-500",
};

export default async function PlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("training_plans")
    .select("id, goal_race_id, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <h1 className="text-2xl font-bold text-[#1F3864]">בוא נבנה לך תוכנית</h1>
        <p className="max-w-md text-neutral-500">בחר מרוץ יעד ותאריך, והמערכת תבנה תוכנית periodization מותאמת עד יום המרוץ.</p>
        <GoalRaceForm />
      </main>
    );
  }

  const { data: race } = await supabase
    .from("goal_races").select("race_type, race_date").eq("id", plan.goal_race_id).maybeSingle();

  const { data: workouts } = await supabase
    .from("plan_workouts")
    .select("id, week_number, day_date, workout_type, planned_distance, status")
    .eq("plan_id", plan.id)
    .order("day_date", { ascending: true });

  const byWeek = new Map<number, typeof workouts>();
  for (const w of workouts ?? []) {
    if (!byWeek.has(w.week_number)) byWeek.set(w.week_number, []);
    byWeek.get(w.week_number)!.push(w);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3864]">תוכנית האימונים</h1>
          {race && (
            <p className="text-sm text-neutral-500">
              יעד: {RACE_LABELS[race.race_type]} · {new Date(race.race_date).toLocaleDateString("he-IL")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Link href="/activities" className="text-sm text-[#2E5A94] underline">האימונים שלי</Link>
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {[...byWeek.entries()].map(([week, ws]) => (
          <section key={week} className="rounded-xl border border-neutral-200 p-4">
            <h2 className="mb-3 font-semibold text-[#2E5A94]">שבוע {week}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(ws ?? []).map((w) => (
                <div key={w.id} className={`rounded-lg px-3 py-2 text-sm ${TYPE_COLORS[w.workout_type] ?? ""}`}>
                  <div className="font-medium">{TYPE_LABELS[w.workout_type] ?? w.workout_type}</div>
                  <div className="text-xs opacity-80">
                    {new Date(w.day_date).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" })}
                    {w.planned_distance ? ` · ${(w.planned_distance / 1000).toFixed(1)} ק"מ` : ""}
                  </div>
                  {w.status === "adjusted" && <div className="mt-1 text-[10px] font-bold">הותאם</div>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
