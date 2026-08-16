"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncMyActivities } from "@/actions/sync";

export function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() =>
          start(async () => {
            const r = await syncMyActivities();
            setMsg(r.error ?? `סונכרנו ${r.data?.synced ?? 0} אימונים`);
            router.refresh();
          })
        }
        disabled={pending}
        className="rounded-lg bg-[#2E5A94] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "מסנכרן…" : "סנכרן עכשיו"}
      </button>
      {msg && <span className="text-sm text-neutral-500">{msg}</span>}
    </div>
  );
}
