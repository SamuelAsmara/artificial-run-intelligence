"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      if (!data.session) { setInfo("נשלח מייל אימות (או שאישור המייל כבוי). התחבר עכשיו."); setLoading(false); return; }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        אימייל
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2" dir="ltr" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        סיסמה
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2" dir="ltr" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-amber-600">{info}</p>}
      <button type="submit" disabled={loading}
        className="rounded-lg bg-[#2E5A94] px-4 py-2 font-medium text-white disabled:opacity-60">
        {loading ? "רגע…" : mode === "signup" ? "הרשמה" : "התחברות"}
      </button>
      <p className="text-center text-sm text-neutral-500">
        {mode === "signup" ? (
          <>כבר יש חשבון? <Link href="/login" className="text-[#2E5A94] underline">התחברות</Link></>
        ) : (
          <>אין חשבון? <Link href="/signup" className="text-[#2E5A94] underline">הרשמה</Link></>
        )}
      </p>
    </form>
  );
}
