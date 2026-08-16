"use client";

/**
 * Settings — a 1:1 port of
 * design_handoff_ari_athlete_app/ARI Settings.dc.html.
 * Markup converted mechanically; do not restyle by hand.
 *
 * NOTE: the Strava connect flow is still simulated. Replacing it with the real
 * OAuth round-trip is a separate task.
 */

import * as React from "react";
import { useRef, useState } from "react";
import { ImageSlot } from "@/components/ui/ImageSlot";
import {
  PROVIDERS, RACE_DEFAULT_TARGET, requiredPace, SET_COPY,
} from "@/lib/screens/settings";

export function SettingsView() {
  const copy = SET_COPY;
  const providers = PROVIDERS;

  const [name, _setName] = useState("Samuel Cohen");
  const [email, _setEmail] = useState("samuel@run.com");
  const [bio, _setBio] = useState(
    "Marathoner in progress — chasing 3:45 in October. Early-morning runner, coffee after, never before.",
  );
  const [age, _setAge] = useState<string | number>(34);
  const [height, _setHeight] = useState<string | number>(178);
  const [weight, _setWeight] = useState<string | number>(72);
  const [level, setLevel] = useState("Intermediate");
  const [goalRace, setGoalRace] = useState("Marathon");
  const [target, _setTarget] = useState("3:45:00");
  const [saved, setSaved] = useState(false);

  const [emailSaved, setEmailSaved] = useState(false);
  const [pass0, _setPass0] = useState("");
  const [pass1, _setPass1] = useState("");
  const [passErr, setPassErr] = useState("");
  const [passSaved, setPassSaved] = useState(false);

  const [strava, setStrava] = useState<"off" | "connecting" | "on">("off");
  const [authOpen, setAuthOpen] = useState(false);
  const [lastSyncV, setLastSyncV] = useState("");
  const [autoSync, setAutoSync] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const targets = useRef<Record<string, string>>({ Marathon: "3:45:00" });
  const t1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const levels = ["Beginner", "Intermediate", "Advanced"].map((n) => ({
    name: n,
    pick: () => { setLevel(n); setSaved(false); },
    bg: level === n ? "var(--color-accent)" : "transparent",
    color: level === n ? "var(--color-accent-ink)" : "var(--color-muted)",
  }));

  const on = strava === "on", off = strava === "off", connecting = strava === "connecting";

  const setName = (e: React.ChangeEvent<HTMLInputElement>) => { _setName(e.target.value); setSaved(false); };
  const setEmail = (e: React.ChangeEvent<HTMLInputElement>) => { _setEmail(e.target.value); setEmailSaved(false); };
  const saveEmail = () => setEmailSaved(email.includes("@"));
  const setPass0 = (e: React.ChangeEvent<HTMLInputElement>) => { _setPass0(e.target.value); setPassSaved(false); setPassErr(""); };
  const setPass1 = (e: React.ChangeEvent<HTMLInputElement>) => { _setPass1(e.target.value); setPassSaved(false); setPassErr(""); };
  const passErrShow = !!passErr;
  const savePass = () => {
    if (!pass0) return setPassErr("Enter your current password.");
    if (pass1.length < 6) return setPassErr("New password must be at least 6 characters.");
    setPassSaved(true); setPassErr(""); _setPass0(""); _setPass1("");
  };
  const setBio = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    _setBio(e.target.value.slice(0, 160)); setSaved(false);
  };
  const bioCount = bio.length + " / 160";

  const raceOpts = ["5K", "10K", "Half", "Marathon"].map((n) => ({
    name: n,
    pick: () => {
      targets.current[goalRace] = target;
      setGoalRace(n);
      _setTarget(targets.current[n] || RACE_DEFAULT_TARGET[n]);
      setSaved(false);
    },
    bg: goalRace === n ? "var(--color-accent)" : "transparent",
    color: goalRace === n ? "var(--color-accent-ink)" : "var(--color-muted)",
  }));
  const setTarget = (e: React.ChangeEvent<HTMLInputElement>) => { _setTarget(e.target.value); setSaved(false); };
  const goalPace = requiredPace(goalRace, target);

  const setHeight = (e: React.ChangeEvent<HTMLInputElement>) => { _setHeight(e.target.value); setSaved(false); };
  const setAge = (e: React.ChangeEvent<HTMLInputElement>) => { _setAge(e.target.value); setSaved(false); };
  const setWeight = (e: React.ChangeEvent<HTMLInputElement>) => { _setWeight(e.target.value); setSaved(false); };
  const save = () => setSaved(true);

  const stravaOff = off, stravaOn = on, stravaConnecting = connecting;
  const stravaBorder = on ? "var(--color-positive)" : "var(--color-line-strong)";
  const stravaSub = off
    ? "Sync runs, streams and gear from Strava"
    : connecting
      ? "Exchanging tokens…"
      : syncing
        ? "Syncing activities…"
        : "Athlete ID 48291077 · " + (autoSync ? "auto-sync on" : "auto-sync off");
  const stravaSubColor = on ? "var(--color-positive)" : "var(--color-faint)";
  const stravaAthlete = "Samuel C. · #48291077";
  const lastSync = syncing ? "Syncing…" : lastSyncV;
  const syncColor = syncing ? "var(--color-caution)" : "var(--color-ink)";

  const stravaConnect = () => setAuthOpen(true);
  const authCancel = () => setAuthOpen(false);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const authorize = () => {
    setAuthOpen(false);
    setStrava("connecting");
    if (t1.current) clearTimeout(t1.current);
    t1.current = setTimeout(() => {
      setStrava("on");
      setLastSyncV("Just now · 18 activities");
    }, 1100);
  };
  const syncNow = () => {
    setSyncing(true);
    if (t2.current) clearTimeout(t2.current);
    t2.current = setTimeout(() => {
      setSyncing(false);
      setLastSyncV("Just now · up to date");
    }, 900);
  };
  const stravaDisconnect = () => { setStrava("off"); setLastSyncV(""); };
  const toggleAuto = () => setAutoSync(!autoSync);
  const autoBg = autoSync ? "var(--color-accent)" : "var(--color-line-strong)";
  const autoKnob = autoSync ? "19px" : "3px";

  return (
<div style={{ maxWidth: "1080px", marginInline: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "12px" }}><header style={{ display: "flex", alignItems: "center", gap: "24px", paddingBlock: "6px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: "9px" }}><span style={{ width: "10px", height: "10px", background: "var(--color-accent)", borderRadius: "2px", display: "inline-block" }}></span><span className="num" style={{ fontWeight: "500", fontSize: "16px", letterSpacing: ".12em" }}>{copy.brand}</span></div><nav className="topnav" style={{ display: "flex", gap: "20px", fontSize: "13px", color: "var(--color-muted)" }}><a href="/dashboard" style={{ color: "var(--color-muted)" }}>{copy.navHome}</a><a href="/activities" style={{ color: "var(--color-muted)" }}>{copy.navActivities}</a><a href="/plan" style={{ color: "var(--color-muted)" }}>{copy.navPlan}</a><a href="#" style={{ color: "var(--color-ink)" }}>{copy.navSettings}</a></nav><div style={{ flex: "1" }}></div><h1 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.title}</h1></header><div className="set-grid"><section className="card" style={{ padding: "20px 22px" }}><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.profileTitle}</h2><p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.profileSub}</p><div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBlockStart: "16px" }}><div style={{ display: "flex", alignItems: "center", gap: "16px" }}><ImageSlot style={{ width: "72px", height: "72px", flex: "none" }} label="Photo" /><div><p style={{ margin: "0", fontSize: "12.5px", fontWeight: "500" }}>{copy.fPhoto}</p><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.fPhotoSub}</p></div></div><div><label htmlFor="f-name" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fName}</label><input className="field" id="f-name" value={name} onChange={setName} /></div><div><label htmlFor="f-bio" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fBio}</label><textarea className="field" id="f-bio" rows={3} style={{ resize: "vertical", minHeight: "64px", fontFamily: "'IBM Plex Sans',sans-serif" }} value={bio} onChange={setBio} placeholder={copy.fBioPh}></textarea><p className="num" style={{ margin: "4px 0 0", fontSize: "10px", color: "var(--color-faint)", textAlign: "end" }}>{bioCount}</p></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}><div><label htmlFor="f-age" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fAge}</label><input className="field num" id="f-age" type="number" value={age} onChange={setAge} /></div><div><label htmlFor="f-height" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fHeight}</label><input className="field num" id="f-height" type="number" value={height} onChange={setHeight} /></div><div><label htmlFor="f-weight" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fWeight}</label><input className="field num" id="f-weight" type="number" value={weight} onChange={setWeight} /></div></div><div><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fLevel}</span><div style={{ display: "flex", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", overflow: "hidden" }}>{levels.map((l, _i1) => (<React.Fragment key={_i1}><button type="button" onClick={l.pick} style={{ flex: "1", font: "500 12px 'IBM Plex Sans',sans-serif", padding: "9px 0", border: "none", cursor: "pointer", background: l.bg, color: l.color }}>{l.name}</button></React.Fragment>))}</div></div><div><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fGoalRace}</span><div style={{ display: "flex", border: "1px solid var(--color-line-strong)", borderRadius: "var(--radius-control)", overflow: "hidden" }}>{raceOpts.map((r, _i2) => (<React.Fragment key={_i2}><button type="button" onClick={r.pick} style={{ flex: "1", font: "500 12px 'IBM Plex Sans',sans-serif", padding: "9px 0", border: "none", cursor: "pointer", background: r.bg, color: r.color }}>{r.name}</button></React.Fragment>))}</div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}><div><label htmlFor="f-target" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fTarget}</label><input className="field num" id="f-target" value={target} onChange={setTarget} placeholder="3:45:00" /></div><div><span style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.fPace}</span><p className="num" style={{ margin: "0", padding: "9px 12px", border: "1px solid var(--color-line)", borderRadius: "var(--radius-control)", fontSize: "13px", color: "var(--color-accent)" }}>{goalPace}</p></div></div><div style={{ display: "flex", alignItems: "center", gap: "12px", marginBlockStart: "2px" }}><button className="btn btn-primary" type="button" onClick={save}>{copy.save}</button>{(saved) ? (<><span className="num" style={{ fontSize: "11px", color: "var(--color-positive)" }}>{copy.savedMsg}</span></>) : null}</div></div></section><section className="card" style={{ padding: "20px 22px" }}><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.connTitle}</h2><p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.connSub}</p><div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBlockStart: "14px" }}><div style={{ display: "flex", flexDirection: "column", border: `1px solid ${stravaBorder}`, borderRadius: "var(--radius-control)", background: "var(--color-elevated)" }}><div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px" }}><span className="num" style={{ width: "34px", height: "34px", borderRadius: "8px", background: "var(--color-strava)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "500" }}>S</span><div style={{ flex: "1" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "500" }}>{copy.strava}</p><p className="num" style={{ margin: "1px 0 0", fontSize: "10.5px", color: stravaSubColor }}>{stravaSub}</p></div>{(stravaOff) ? (<><button className="btn" type="button" onClick={stravaConnect} style={{ background: "var(--color-strava)", color: "#fff", padding: "7px 14px" }}>{copy.connect}</button></>) : null}{(stravaConnecting) ? (<><span className="num" style={{ fontSize: "11px", color: "var(--color-muted)" }}>{copy.connecting}</span></>) : null}{(stravaOn) ? (<><span className="tag" style={{ background: "var(--color-surface)", color: "var(--color-positive)" }}>{copy.connected}</span></>) : null}</div>{(stravaOn) ? (<><div style={{ borderBlockStart: "1px solid var(--color-line)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{copy.stAccount}</span><span className="num" style={{ fontSize: "12px" }}>{stravaAthlete}</span></div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{copy.stLastSync}</span><span className="num" style={{ fontSize: "12px", color: syncColor }}>{lastSync}</span></div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{copy.stAuto}</span><button type="button" onClick={toggleAuto} aria-label="Toggle auto-sync" style={{ width: "38px", height: "21px", borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", position: "relative", background: autoBg }}><span style={{ position: "absolute", top: "2.5px", insetInlineStart: autoKnob, width: "16px", height: "16px", borderRadius: "50%", background: "var(--color-ink)", transition: "inset-inline-start .15s" }}></span></button></div><div style={{ display: "flex", gap: "8px", marginBlockStart: "2px" }}><button className="btn btn-secondary" type="button" onClick={syncNow} style={{ padding: "7px 13px", fontSize: "12px" }}>{copy.syncNow}</button><button className="btn" type="button" onClick={stravaDisconnect} style={{ padding: "7px 13px", fontSize: "12px", color: "var(--color-negative)", borderColor: "transparent", background: "transparent" }}>{copy.disconnect}</button></div></div></>) : null}</div>{providers.map((p, _i3) => (<React.Fragment key={_i3}><div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", border: "1px solid var(--color-line)", borderRadius: "var(--radius-control)" }}><span className="num" style={{ width: "34px", height: "34px", borderRadius: "8px", background: p.bg, color: "var(--color-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "500" }}>{p.letter}</span><div style={{ flex: "1" }}><p style={{ margin: "0", fontSize: "13px", fontWeight: "500", color: "var(--color-muted)" }}>{p.name}</p></div><span className="tag" style={{ background: "var(--color-elevated)", color: "var(--color-faint)" }}>{copy.soon}</span></div></React.Fragment>))}</div></section></div><section className="card" style={{ padding: "20px 22px" }}><h2 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{copy.secTitle}</h2><p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--color-faint)" }}>{copy.secSub}</p><div className="set-grid" style={{ marginBlockStart: "16px" }}><div style={{ display: "flex", flexDirection: "column", gap: "12px" }}><div><label htmlFor="s-email" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.curEmail}</label><input className="field" id="s-email" type="email" value={email} onChange={setEmail} /></div><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><button className="btn btn-secondary" type="button" onClick={saveEmail}>{copy.updEmail}</button>{(emailSaved) ? (<><span className="num" style={{ fontSize: "11px", color: "var(--color-positive)" }}>{copy.emailMsg}</span></>) : null}</div></div><div style={{ display: "flex", flexDirection: "column", gap: "12px" }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}><div><label htmlFor="s-pass0" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.curPass}</label><input className="field" id="s-pass0" type="password" value={pass0} onChange={setPass0} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></div><div><label htmlFor="s-pass1" style={{ display: "block", fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "6px" }}>{copy.newPass}</label><input className="field" id="s-pass1" type="password" value={pass1} onChange={setPass1} placeholder="min. 6 characters" /></div></div>{(passErrShow) ? (<><p className="num" style={{ margin: "0", fontSize: "11px", color: "var(--color-negative)" }}>{passErr}</p></>) : null}<div style={{ display: "flex", alignItems: "center", gap: "12px" }}><button className="btn btn-secondary" type="button" onClick={savePass}>{copy.updPass}</button>{(passSaved) ? (<><span className="num" style={{ fontSize: "11px", color: "var(--color-positive)" }}>{copy.passMsg}</span></>) : null}</div></div></div></section>{(authOpen) ? (<><div style={{ position: "fixed", inset: "0", background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "60" }} onClick={authCancel}><div className="card" style={{ width: "min(420px,92vw)", padding: "24px 26px", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }} onClick={stop}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><span className="num" style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--color-strava)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "500" }}>S</span><div><h3 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>{copy.authTitle}</h3><p className="num" style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.authSub}</p></div></div><p style={{ margin: "16px 0 8px", fontSize: "12.5px", color: "var(--color-muted)" }}>{copy.authScopes}</p><ul style={{ margin: "0", paddingInlineStart: "18px", display: "flex", flexDirection: "column", gap: "5px", fontSize: "12.5px", color: "var(--color-ink)" }}><li>{copy.scope1}</li><li>{copy.scope2}</li><li>{copy.scope3}</li></ul><p style={{ margin: "14px 0 0", fontSize: "11px", color: "var(--color-faint)" }}>{copy.authNote}</p><div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginBlockStart: "18px" }}><button className="btn btn-secondary" type="button" onClick={authCancel}>{copy.cancel}</button><button className="btn" type="button" onClick={authorize} style={{ background: "var(--color-strava)", color: "#fff" }}>{copy.authorize}</button></div></div></div></>) : null}</div>
  );
}
