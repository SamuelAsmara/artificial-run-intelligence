"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoalRace } from "@/actions/goalRace";

const RACE_LABELS: Record<string, string> = {
  "5k": "5 ק\"מ",
  "10k": "10 ק\"מ",
  half: "חצי מרתון",
  full: "מרתון",
};

export function GoalRaceForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raceType, setRaceType] = useState("10k");
  const [raceDate, setRaceDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createGoalRace({ raceType: raceType as "5k" | "10k" | "half" | "full", raceDate });
          if (r.error) { setError(r.error); return; }
          router.push("/plan");
          router.refresh();
        });
      }}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        סוג מרוץ
        <select value={raceType} onChange={(e) => setRaceType(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2">
          {Object.entries(RACE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        תאריך המרוץ
        <input type="date" required value={raceDate} onChange={(e) => setRaceDate(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-lg bg-[#2E5A94] px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "בונה תוכנית…" : "בנה לי תוכנית"}
      </button>
    </form>
  );
}
