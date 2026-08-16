"use client";

/**
 * Login / onboarding — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Login.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 *
 * NOTE: validation and view switching are still the prototype's local logic.
 * Hooking this to Supabase auth is a separate task.
 */

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_COPY, qrPath as buildQrPath, TARGET_BY_RACE } from "@/lib/screens/login";

export function LoginView({ initialMode = "signup" }: { initialMode?: "login" | "signup" }) {
  const copy = LOGIN_COPY;
  const router = useRouter();
  const qrPath = useMemo(() => buildQrPath(), []);

  const [view, setView] = useState<"auth" | "empty" | "coach">("auth");
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [role, setRole] = useState<"athlete" | "coach">("athlete");
  const [username, setUsername] = useState("");
  const [email, _setEmail] = useState("");
  const [pass, _setPass] = useState("");
  const [err, setErr] = useState("");

  const [codeOpen, setCodeOpen] = useState(false);
  const [code, _setCode] = useState("");
  const [sync, setSync] = useState<"idle" | "sync" | "done">("idle");

  const [planOpen, setPlanOpen] = useState(false);
  const [planBuilt, setPlanBuilt] = useState(false);
  const [pRace, setPRace] = useState("Marathon");
  const [pDate, _setPDate] = useState("2026-10-11");
  const [pTarget, _setPTarget] = useState("3:45:00");
  const [pDays, setPDays] = useState("5 days");
  const [gen, setGen] = useState<"idle" | "run">("idle");

  const genTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Real Supabase auth behind the prototype's UI. On success we land on the
   * designed zero-state (athlete) or the coach welcome card, exactly as the
   * prototype does — the difference is that a session now actually exists,
   * so /dashboard is reachable.
   */
  const submit = async () => {
    if (mode === "signup" && !username.trim()) return setErr("Username is required.");
    if (!email.trim() || !email.includes("@")) return setErr("Enter a valid email.");
    if (pass.length < 6) return setErr("Password must be at least 6 characters.");
    setErr("");

    const supabase = createClient();
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: { data: { username, role } },
      });
      if (error) return setErr(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) return setErr(error.message);
    }

    router.refresh();
    setView(mode === "signup" && role === "coach" ? "coach" : "empty");
  };

  const isAuth = view === "auth";
  const isEmpty = view === "empty";
  const isCoachDone = view === "coach";
  const isSignup = mode === "signup";

  const loginBg = mode === "login" ? "var(--color-accent)" : "transparent";
  const loginColor = mode === "login" ? "var(--color-accent-ink)" : "var(--color-muted)";
  const signupBg = mode === "signup" ? "var(--color-accent)" : "transparent";
  const signupColor = mode === "signup" ? "var(--color-accent-ink)" : "var(--color-muted)";
  const setLogin = () => { setMode("login"); setErr(""); };
  const setSignup = () => { setMode("signup"); setErr(""); };

  const setUser = (e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value);
  const setEmail = (e: React.ChangeEvent<HTMLInputElement>) => _setEmail(e.target.value);
  const setPass = (e: React.ChangeEvent<HTMLInputElement>) => _setPass(e.target.value);
  const pickAthlete = () => setRole("athlete");
  const pickCoach = () => setRole("coach");
  const athBg = role === "athlete" ? "var(--color-elevated)" : "transparent";
  const athEdge = role === "athlete" ? "var(--color-accent)" : "var(--color-line-strong)";
  const coBg = role === "coach" ? "var(--color-elevated)" : "transparent";
  const coEdge = role === "coach" ? "var(--color-accent)" : "var(--color-line-strong)";

  const hasErr = !!err;
  const submitLabel = mode === "login" ? "Log in" : "Create account";
  const greetName = "Welcome" + (username ? ", " + username : "");
  const emptyTiles = [
    { name: "Cardiac Drift" }, { name: "Weekly Volume" },
    { name: "ACWR · Load Ratio" }, { name: "Form (TSB)" },
  ];

  const buildPlan = () => { setPlanOpen(true); setGen("idle"); };
  const closePlan = () => { setPlanOpen(false); setGen("idle"); };
  const planGen = gen === "run";
  const setPDate = (e: React.ChangeEvent<HTMLInputElement>) => _setPDate(e.target.value);
  const setPTarget = (e: React.ChangeEvent<HTMLInputElement>) => _setPTarget(e.target.value);
  const pRaceOpts = ["5K", "10K", "Half", "Marathon"].map((n) => ({
    name: n,
    pick: () => { setPRace(n); _setPTarget(TARGET_BY_RACE[n]); },
    bg: pRace === n ? "var(--color-accent)" : "transparent",
    color: pRace === n ? "var(--color-accent-ink)" : "var(--color-muted)",
  }));
  const pDayOpts = ["3 days", "4 days", "5 days", "6 days"].map((n) => ({
    name: n,
    pick: () => setPDays(n),
    bg: pDays === n ? "var(--color-accent)" : "transparent",
    color: pDays === n ? "var(--color-accent-ink)" : "var(--color-muted)",
  }));
  const genPlan = () => {
    if (gen === "run") return;
    setGen("run");
    if (genTimer.current) clearTimeout(genTimer.current);
    genTimer.current = setTimeout(() => {
      setPlanOpen(false); setGen("idle"); setPlanBuilt(true);
    }, 1300);
  };

  const openCode = () => { setCodeOpen(true); setSync("idle"); };
  const closeCode = () => { setCodeOpen(false); setSync("idle"); };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const setCode = (e: React.ChangeEvent<HTMLInputElement>) => _setCode(e.target.value);
  const joinPlan = () => {
    if (!code.trim()) return;
    setSync("sync");
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => setSync("done"), 1100);
  };
  const syncing = sync === "sync";
  const synced = sync === "done";
  const notSynced = sync !== "done";

  return (
<div>{(isAuth) ? (<><div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}><div style={{ width: "min(420px,94vw)" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", marginBlockEnd: "18px" }}><span style={{ width: "12px", height: "12px", background: "var(--color-accent)", borderRadius: "3px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "20px", letterSpacing: ".14em" }}>{copy.brand}</span></div><p style={{ margin: "0 0 18px", textAlign: "center", fontSize: "12.5px", color: "var(--color-muted)" }}>{copy.tagline}</p><div className="card" style={{ padding: "22px 24px" }}><div style={{ display: "flex", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", overflow: "hidden", marginBlockEnd: "16px" }}><button type="button" onClick={setLogin} style={{ flex: "1", font: "500 12.5px 'IBM Plex Sans',sans-serif", padding: "9px 0", border: "none", cursor: "pointer", background: loginBg, color: loginColor }}>{copy.login}</button><button type="button" onClick={setSignup} style={{ flex: "1", font: "500 12.5px 'IBM Plex Sans',sans-serif", padding: "9px 0", border: "none", cursor: "pointer", background: signupBg, color: signupColor }}>{copy.signup}</button></div><div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{(isSignup) ? (<><div><label htmlFor="a-user" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fUser}</label><input className="field" id="a-user" value={username} onChange={setUser} placeholder="samuel_c" /></div></>) : null}<div><label htmlFor="a-email" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fEmail}</label><input className="field" id="a-email" type="email" value={email} onChange={setEmail} placeholder="you@run.com" /></div><div><label htmlFor="a-pass" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fPass}</label><input className="field" id="a-pass" type="password" value={pass} onChange={setPass} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></div>{(isSignup) ? (<><div><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fRole}</span><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}><button type="button" onClick={pickAthlete} style={{ fontFamily: "inherit", cursor: "pointer", padding: "12px", borderRadius: "var(--radius-control)", background: athBg, border: `1px solid ${athEdge}`, textAlign: "start" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "500", color: "var(--color-ink)" }}>{copy.roleAth}</p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{copy.roleAthSub}</p></button><button type="button" onClick={pickCoach} style={{ fontFamily: "inherit", cursor: "pointer", padding: "12px", borderRadius: "var(--radius-control)", background: coBg, border: `1px solid ${coEdge}`, textAlign: "start" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "500", color: "var(--color-ink)" }}>{copy.roleCoach}</p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{copy.roleCoachSub}</p></button></div></div></>) : null}{(hasErr) ? (<><p className="num" style={{ margin: "0", fontSize: "11.5px", color: "var(--color-negative)" }}>{err}</p></>) : null}<button className="btn btn-primary" type="button" onClick={submit} style={{ width: "100%", marginBlockStart: "4px" }}>{submitLabel}</button></div></div><p className="num" style={{ margin: "14px 0 0", textAlign: "center", fontSize: "10.5px", color: "var(--color-faint)" }}>{copy.demoNote}</p></div></div></>) : null}{(isEmpty) ? (<><div style={{ maxWidth: "1280px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-faint)" }}><span style={{ color: "var(--color-ink)" }}>{copy.navHome}</span><span>{copy.navActivities}</span><span>{copy.navPlan}</span><span>{copy.navSettings}</span></nav><div style={{ flex: "1" }}></div><div style={{ textAlign: "end" }}><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{greetName}</h1><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.emptyContext}</p></div></header><section className="card hero-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "20px", padding: "20px 24px", alignItems: "center" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}><div style={{ width: "116px", height: "116px", borderRadius: "50%", border: "2px dashed var(--color-line-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="num" style={{ fontSize: "30px", color: "var(--color-faint)" }}>--</span></div><p className="num" style={{ margin: "0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.emptyReadiness}</p></div><div style={{ borderInlineStart: "1px solid var(--color-line)", paddingInlineStart: "28px", display: "flex", flexDirection: "column", gap: "12px", alignSelf: "stretch", justifyContent: "center" }}><div><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.aiTag}</span></div><p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55", maxWidth: "640px", textWrap: "pretty" }}>{copy.emptyNarrative}</p><div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBlockStart: "4px" }}><button className="btn btn-primary" type="button" onClick={buildPlan}>{copy.ctaBuild}</button><button className="btn btn-secondary" type="button" onClick={openCode}>{copy.ctaCode}</button></div></div></section><section className="grid">{emptyTiles.map((m, _i1) => (<React.Fragment key={_i1}><div className="card c3" style={{ padding: "16px 18px" }}><span className="num" style={{ fontSize: "30px", fontWeight: "500", color: "var(--color-faint)" }}>--</span><p style={{ margin: "6px 0 2px", fontSize: "12px", color: "var(--color-muted)" }}>{m.name}</p><p className="num" style={{ margin: "0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.noData}</p></div></React.Fragment>))}</section><section className="card" style={{ padding: "40px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m7 15 4-6 4 3 4-7" /></svg><p style={{ margin: "0", fontSize: "13px", color: "var(--color-muted)" }}>{copy.emptyChartTitle}</p><p style={{ margin: "0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.emptyChartSub}</p></section>{(planBuilt) ? (<><section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", padding: "14px 20px", borderColor: "var(--color-positive)" }}><p style={{ margin: "0", fontSize: "13px" }}><span className="num" style={{ color: "var(--color-positive)", fontWeight: "500" }}>{copy.builtMsg}</span><span style={{ color: "var(--color-muted)" }}> {copy.builtSub}</span></p><a className="btn btn-primary" href="/dashboard">{copy.builtGo}</a></section></>) : null}</div></>) : null}{(isCoachDone) ? (<><div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}><div className="card" style={{ width: "min(420px,94vw)", padding: "26px", textAlign: "center" }}><span className="tag" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>{copy.coachTag}</span><h2 style={{ margin: "12px 0 4px", fontSize: "17px", fontWeight: "600" }}>{copy.coachWelcome}</h2><p style={{ margin: "0 0 18px", fontSize: "12.5px", color: "var(--color-muted)" }}>{copy.coachSub}</p><a className="btn btn-primary" href="/coach" style={{ width: "100%" }}>{copy.coachGo}</a></div></div></>) : null}{(planOpen) ? (<><div style={{ position: "fixed", inset: "0", background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "60" }} onClick={closePlan}><div className="card" style={{ width: "min(440px,92vw)", padding: "24px 26px" }} onClick={stop}><h3 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.planTitle}</h3><p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{copy.planSub}</p><div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBlockStart: "16px" }}><div><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.pRace}</span><div style={{ display: "flex", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", overflow: "hidden" }}>{pRaceOpts.map((r, _i2) => (<React.Fragment key={_i2}><button type="button" onClick={r.pick} style={{ flex: "1", font: "500 12px 'IBM Plex Sans',sans-serif", padding: "9px 0", border: "none", cursor: "pointer", background: r.bg, color: r.color }}>{r.name}</button></React.Fragment>))}</div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}><div><label htmlFor="p-date" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.pDate}</label><input className="field num" id="p-date" type="date" value={pDate} onChange={setPDate} /></div><div><label htmlFor="p-target" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.pTarget}</label><input className="field num" id="p-target" value={pTarget} onChange={setPTarget} placeholder="3:45:00" /></div></div><div><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.pDays}</span><div style={{ display: "flex", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", overflow: "hidden" }}>{pDayOpts.map((d, _i3) => (<React.Fragment key={_i3}><button className="num" type="button" onClick={d.pick} style={{ flex: "1", fontSize: "12px", padding: "9px 0", border: "none", cursor: "pointer", background: d.bg, color: d.color }}>{d.name}</button></React.Fragment>))}</div></div>{(planGen) ? (<><p className="num" style={{ margin: "0", fontSize: "11.5px", color: "var(--color-caution)" }}>{copy.planGenMsg}</p></>) : null}<div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginBlockStart: "2px" }}><button className="btn btn-secondary" type="button" onClick={closePlan}>{copy.cancel}</button><button className="btn btn-primary" type="button" onClick={genPlan}>{copy.planGo}</button></div></div></div></div></>) : null}{(codeOpen) ? (<><div style={{ position: "fixed", inset: "0", background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "60" }} onClick={closeCode}><div className="card" style={{ width: "min(400px,92vw)", padding: "24px 26px" }} onClick={stop}><h3 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.codeTitle}</h3><p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>{copy.codeSub}</p><div style={{ display: "flex", alignItems: "center", gap: "16px", marginBlockStart: "16px" }}><svg width="96" height="96" viewBox="0 0 96 96" style={{ flex: "none", background: "var(--color-ink)", borderRadius: "8px" }}><path d={qrPath} fill="var(--color-canvas)" /></svg><div style={{ flex: "1" }}><p style={{ margin: "0 0 6px", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)" }}>{copy.codeField}</p><input className="field num" value={code} onChange={setCode} placeholder="ARI-XXXX" /></div></div>{(syncing) ? (<><p className="num" style={{ margin: "14px 0 0", fontSize: "11.5px", color: "var(--color-caution)" }}>{copy.syncing}</p></>) : null}{(synced) ? (<><div style={{ marginBlockStart: "14px", padding: "12px 14px", border: "1px solid var(--color-positive)", borderRadius: "var(--radius-control)" }}><p className="num" style={{ margin: "0", fontSize: "12px", color: "var(--color-positive)" }}>{copy.syncedMsg}</p><p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--color-muted)" }}>{copy.syncedSub}</p></div></>) : null}<div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginBlockStart: "18px" }}><button className="btn btn-secondary" type="button" onClick={closeCode}>{copy.cancel}</button>{(synced) ? (<><a className="btn btn-primary" href="/dashboard">{copy.builtGo}</a></>) : null}{(notSynced) ? (<><button className="btn btn-primary" type="button" onClick={joinPlan}>{copy.join}</button></>) : null}</div></div></div></>) : null}</div>
  );
}
