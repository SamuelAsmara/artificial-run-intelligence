"use client";

/**
 * Sign in — a port of
 * design_handoff_ari_athlete_app/new_login_design/ARI Login.dc.html.
 *
 * ## The screen
 *
 * A fixed, full-bleed photograph of runners at night under a brand-blue wash,
 * with one glass card floating over it. The card is the only thing on the page
 * that asks for anything; everything else is atmosphere.
 *
 * ## Two departures from the handoff, both deliberate
 *
 * **"Remember device" is gone.** Supabase already persists the session, so the
 * checkbox would have been a control that does nothing — the same fault we
 * removed from the dashboard's borrowed readiness score and from the activity
 * page's invented "planned vs actual". Nothing on screen should claim to do
 * something it does not do. Making it real means switching the auth cookie
 * between persistent and session-scoped, which is worth doing later and is not
 * worth pretending about now.
 *
 * **The screens after sign-in are gone too.** The prototype carried its own
 * zero-state, a coach welcome and a plan-builder modal. All three now live
 * where they belong: `EmptyDashboard` handles an account with no history, and
 * connecting a data source is on Settings. This file signs you in and sends
 * you to the dashboard.
 */

import { useState, useTransition } from "react";
import { BrandMark } from "@/components/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_COPY, MIN_PASSWORD } from "@/lib/screens/login";

const copy = LOGIN_COPY;

/**
 * A 24x15 copy of the photograph, inlined.
 *
 * 178 bytes, so it costs nothing and arrives with the HTML. It sits behind the
 * real image and is blurred up to fill the screen, which means the first paint
 * is the photograph's colour and shape rather than a black rectangle waiting
 * for 80 KB to land.
 */
const HERO_BLUR =
  "data:image/webp;base64,UklGRqoAAABXRUJQVlA4IJ4AAAAQBACdASoYAA8APu1iqU2ppaOiMAgBMB2JQBOmUABQsz+HJvCykLb3+AD+2pKML0+25TV0bGpX+iQj+6gzj9OKKkn7NiCgZV/tcXrPnzQHjafWuU8A+Uej2FpwVKAilS00KmX+2oDYKWJcPgogasrNlqSClsoWBmOmpkFQeMlk2p42TJv+dyLNjLQ0uNArH/KYAQAkNxYxqP1oQmAAAA==";

/**
 * What the `?error=` codes our own auth routes emit mean in English.
 *
 * `/auth/callback` and `/auth/confirm` bounce failures back here with a code in
 * the query string. Until now nothing on this screen read it, so an expired
 * confirmation link landed the athlete on a clean sign-in card with no hint
 * that anything had gone wrong — they retype the password they never set and
 * conclude the product is broken.
 */
const AUTH_ERRORS: Record<string, string> = {
  "missing-code": "That link is incomplete. Ask for a new one below.",
  "link-expired": "That link has expired or was already used. Request a new one.",
  "missing-token": "That link is incomplete. Ask for a new one below.",
  "verify-failed": "That link has expired or was already used. Request a new one.",
};

export function LoginView({ initialMode = "login" }: { initialMode?: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const urlError = params.get("error");

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [role, setRole] = useState<"athlete" | "coach">("athlete");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState(
    urlError ? (AUTH_ERRORS[urlError] ?? "That link didn't work. Request a new one.") : "",
  );
  const [notice, setNotice] = useState("");
  /** Which provider the athlete just tried that we have not built yet. */
  const [notYet, setNotYet] = useState("");
  const [pending, startTransition] = useTransition();

  const isSignup = mode === "signup";

  const switchTo = (next: "login" | "signup") => {
    setMode(next);
    setErr("");
    setNotice("");
    setNotYet("");
  };

  /**
   * The social buttons look and feel live, by request, and do nothing yet.
   *
   * They still answer when pressed. A button that looks clickable and responds
   * with silence does not read as "not ready" — it reads as broken, and the
   * athlete presses it three more times before giving up on the whole page.
   * One line of text costs nothing and keeps the design clean.
   */
  const setNotSoon = (provider: string) => {
    setErr("");
    setNotice("");
    setNotYet(`${provider} sign-in isn't ready yet — use your email for now.`);
  };

  /**
   * Where to land after a successful sign-in.
   *
   * The middleware appends `?redirectTo=/activities/<id>` when it bounces a
   * signed-out visitor. Only same-origin paths are honoured: an absolute URL
   * here would turn our own sign-in screen into an open redirect.
   */
  const redirectTarget = () => {
    const target = params.get("redirectTo");
    return target && target.startsWith("/") && !target.startsWith("//") ? target : "/dashboard";
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (isSignup && !username.trim()) return setErr("Tell Runi what to call you.");
    if (!email.includes("@")) return setErr("That doesn't look like an email address.");
    /*
     * The eight-character rule is a rule about *choosing* a password, not about
     * typing one you already have. Enforcing it on sign-in refused to even try
     * for anyone whose account predates the rule, and told them their own
     * password was invalid — a lie the server never got a chance to correct.
     */
    if (isSignup && pass.length < MIN_PASSWORD) return setErr(`Use at least ${MIN_PASSWORD} characters.`);
    if (!isSignup && !pass) return setErr("Enter your password.");

    setErr("");
    setNotice("");
    startTransition(async () => {
      const supabase = createClient();

      if (isSignup) {
        // `role` rides along in user metadata so the coaching side knows which
        // kind of account this is the moment it is built.
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: {
            data: { username: username.trim(), role },
            /*
             * Without this the confirmation link goes wherever the Supabase
             * dashboard's "Site URL" points, which is one global setting shared
             * by localhost and production. Naming the callback explicitly means
             * a signup started here finishes here — on whichever origin "here"
             * happens to be — and `next` carries the deep link through.
             */
            emailRedirectTo: `${window.location.origin}/auth/callback${
              redirectTarget() === "/dashboard" ? "" : `?next=${encodeURIComponent(redirectTarget())}`
            }`,
          },
        });
        if (error) return setErr(error.message);
        /*
         * Signing up with an address that already exists is not an error.
         *
         * Supabase deliberately returns a success shaped exactly like a fresh
         * signup — otherwise this form would be an oracle for "does this person
         * have an account here". The tell is that `identities` comes back empty.
         * We keep the ambiguity in the copy (no confirmation that the address is
         * taken) while pointing them at the door they actually need.
         */
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          return setNotice(copy.maybeExisting);
        }
        // With email confirmation on, there is no session yet — saying "welcome"
        // and landing on a signed-out dashboard would be the wrong story.
        if (!data.session) return setNotice(copy.confirmSent);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });
        if (error) return setErr(error.message);
      }

      /*
       * Back to wherever they were headed.
       *
       * The middleware appends `?redirectTo=/activities/<id>` when it bounces a
       * signed-out visitor, and this used to ignore it and always land on the
       * dashboard — so anyone following a shared link lost their destination at
       * the door. Only same-origin paths are honoured: an absolute URL here
       * would be an open redirect.
       */
      router.push(redirectTarget());
      router.refresh();
    });
  };

  const forgot = () => {
    if (!email.includes("@")) return setErr("Enter your email address first.");
    setErr("");
    setNotYet("");
    startTransition(async () => {
      const supabase = createClient();
      /*
       * The recovery link has to land on a page that collects a new password.
       * Without `redirectTo` it lands on the Site URL — the dashboard — where
       * the recovery session silently expires and the athlete is no closer to
       * getting in. `/auth/reset` is that page.
       */
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) return setErr(error.message);
      setNotice(copy.resetSent);
    });
  };

  return (
    <div style={{ position: "relative", minHeight: "100dvh" }}>
      {/* The photograph, with the blurred twin underneath it. WebP first; the
          JPEG is there for anything that cannot read it. */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, zIndex: 0,
          backgroundImage: `url(${HERO_BLUR})`,
          backgroundSize: "cover", backgroundPosition: "center",
          filter: "blur(24px)", transform: "scale(1.1)",
        }}
      />
      <picture>
        <source srcSet="/login/hero.webp" type="image/webp" />
        <img
          src="/login/hero.jpg"
          alt=""
          fetchPriority="high"
          style={{
            position: "fixed", inset: 0, zIndex: 0,
            width: "100%", height: "100%", objectFit: "cover",
          }}
        />
      </picture>

      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
          background:
            "linear-gradient(160deg, rgba(20,36,61,.38), rgba(8,10,14,.3) 55%, rgba(78,142,247,.14))",
        }}
      />

      <div style={{
        position: "relative", zIndex: 2, minHeight: "100dvh",
        display: "grid", justifyItems: "center", alignContent: "safe center",
        padding: "24px 16px", boxSizing: "border-box",
      }}>
        <div style={{
          width: "min(360px, 94vw)", boxSizing: "border-box",
          borderRadius: "18px",
          background: "rgba(22,30,46,.5)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 24px 80px rgba(0,0,0,.4)",
          padding: "22px 24px",
          display: "flex", flexDirection: "column", gap: "15px",
        }}>
          <div>
            {/* the mark and the name, above the tagline — the card is the
                first thing a new athlete sees, so the brand lives here too */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBlockEnd: "10px" }}>
              <BrandMark size={22} />
              <span className="num" style={{ fontWeight: 500, fontSize: "15px", letterSpacing: ".14em", color: "var(--color-ink)" }}>
                {copy.brand}
              </span>
            </div>
            <h1 style={{
              margin: 0, fontFamily: "'Archivo Black', var(--font-sans)",
              fontSize: "20px", lineHeight: 1, fontWeight: 400,
              letterSpacing: "-0.4px", textTransform: "uppercase",
              color: "var(--color-ink)",
            }}>
              {copy.heroTitle}
            </h1>
            <p style={{ margin: "7px 0 0", fontSize: "12.5px", lineHeight: 1, color: "var(--color-muted)" }}>
              {copy.heroSub}
            </p>
          </div>

          <div role="tablist" style={{
            display: "flex", height: "38px", borderRadius: "100px",
            background: "rgba(15,23,42,.55)", padding: "3px", boxSizing: "border-box",
          }}>
            {(["login", "signup"] as const).map((tab) => {
              const on = mode === tab;
              return (
                <button
                  key={tab} type="button" role="tab" aria-selected={on}
                  onClick={() => switchTo(tab)}
                  style={{
                    flex: 1, border: "none", cursor: "pointer", borderRadius: "100px",
                    font: `${on ? 600 : 500} 12px var(--font-sans)`,
                    background: on ? "rgba(255,255,255,.12)" : "transparent",
                    color: on ? "var(--color-ink)" : "var(--color-muted)",
                  }}
                >
                  {tab === "login" ? copy.login : copy.signup}
                </button>
              );
            })}
          </div>

          {/*
            A real <form>, not a div of inputs.

            Typing an email and a password and pressing Enter is how everybody
            signs in to everything. With the controls loose in a div, Enter did
            nothing at all — the athlete's first interaction with Runi was a key
            press the page ignored. Submitting through the form also gives the
            browser its password-manager hooks for free.
          */}
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
            {isSignup ? (
              <FieldRow label={copy.fUser} htmlFor="a-user" icon={<IconUser />}>
                <input
                  className="afield" id="a-user" value={username} autoComplete="nickname"
                  onChange={(e) => setUsername(e.target.value)} placeholder={copy.fUserPh}
                />
              </FieldRow>
            ) : null}

            <FieldRow label={copy.fEmail} htmlFor="a-email" icon={<IconMail />}>
              <input
                className="afield" id="a-email" type="email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} placeholder={copy.fEmailPh}
              />
            </FieldRow>

            <FieldRow
              label={copy.fPass}
              htmlFor="a-pass"
              icon={<IconLock />}
              trailing={
                <button
                  type="button" onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", insetBlockStart: "9px", insetInlineEnd: "10px",
                    background: "none", border: "none", cursor: "pointer",
                    padding: "2px", color: "var(--color-faint)",
                  }}
                >
                  <IconEye off={reveal} />
                </button>
              }
            >
              <input
                className="afield" id="a-pass" type={reveal ? "text" : "password"} value={pass}
                autoComplete={isSignup ? "new-password" : "current-password"}
                onChange={(e) => setPass(e.target.value)} placeholder={copy.fPassPh}
                minLength={isSignup ? MIN_PASSWORD : undefined}
              />
            </FieldRow>

            {!isSignup ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button" onClick={forgot} disabled={pending}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    font: "500 12px var(--font-sans)", color: "var(--color-accent)",
                  }}
                >
                  {copy.forgot}
                </button>
              </div>
            ) : null}

            {isSignup ? (
              <div>
                <span style={{
                  display: "block", fontSize: "10px", letterSpacing: ".08em",
                  textTransform: "uppercase", color: "var(--color-muted)", marginBlockEnd: "5px",
                }}>
                  {copy.fRole}
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <RoleButton
                    title={copy.roleAth} sub={copy.roleAthSub}
                    on={role === "athlete"} onPick={() => setRole("athlete")}
                  />
                  <RoleButton
                    title={copy.roleCoach} sub={copy.roleCoachSub}
                    on={role === "coach"} onPick={() => setRole("coach")}
                  />
                </div>
              </div>
            ) : null}

            {err ? (
              <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-negative)" }}>
                {err}
              </p>
            ) : null}
            {notice ? (
              <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-positive)" }}>
                {notice}
              </p>
            ) : null}
            {notYet ? (
              <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-muted)" }}>
                {notYet}
              </p>
            ) : null}

            <button
              type="submit" disabled={pending}
              style={{
                width: "100%", height: "42px", borderRadius: "100px", border: "none",
                cursor: pending ? "progress" : "pointer",
                background: "var(--color-accent)", color: "var(--color-accent-ink)",
                font: "700 13.5px var(--font-sans)", letterSpacing: ".5px",
                boxShadow: "0 4px 16px color-mix(in oklab, var(--color-accent) 20%, transparent)",
                opacity: pending ? 0.75 : 1,
              }}
            >
              {pending ? copy.working : isSignup ? copy.submitSignup : copy.submitLogin}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ flex: 1, height: "1px", background: "rgba(255,255,255,.12)" }} />
              <span style={{
                fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase",
                color: "var(--color-faint)",
              }}>
                {copy.orConnect}
              </span>
              <span style={{ flex: 1, height: "1px", background: "rgba(255,255,255,.12)" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <SocialButton label={copy.google} icon={<IconGoogle />} onClick={() => setNotSoon(copy.google)} />
              <SocialButton label={copy.apple} icon={<IconApple />} onClick={() => setNotSoon(copy.apple)} />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FieldRow({
  label, htmlFor, icon, trailing, children,
}: {
  label: string;
  htmlFor: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <label htmlFor={htmlFor} style={{
        fontSize: "10.5px", fontWeight: 600, letterSpacing: "1.1px",
        textTransform: "uppercase", color: "var(--color-muted)",
      }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", insetBlockStart: "12px", insetInlineStart: "14px",
          color: "var(--color-faint)", pointerEvents: "none", display: "flex",
        }}>
          {icon}
        </span>
        {children}
        {trailing}
      </div>
    </div>
  );
}

function RoleButton({
  title, sub, on, onPick,
}: {
  title: string;
  sub: string;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button" onClick={onPick} aria-pressed={on}
      style={{
        fontFamily: "inherit", cursor: "pointer", padding: "12px",
        borderRadius: "var(--radius-control)", textAlign: "start",
        background: on ? "var(--color-elevated)" : "transparent",
        border: `1px solid ${on ? "var(--color-accent)" : "var(--color-line-strong)"}`,
      }}
    >
      <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, color: "var(--color-ink)" }}>{title}</p>
      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-muted)" }}>{sub}</p>
    </button>
  );
}

/**
 * A provider we intend to support and have not built.
 *
 * Drawn as an ordinary button rather than a disabled one: the greyed-out
 * treatment fought the card, and the row has to exist anyway so that wiring
 * OAuth later is a change of handler and nothing else. What it must not do is
 * stay silent when pressed — see `setNotSoon`.
 */
function SocialButton({
  label, icon, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: "38px", borderRadius: "100px", background: "none",
        border: "1px solid rgba(255,255,255,.12)", cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
        color: "var(--color-ink)", font: "500 12px var(--font-sans)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* --- icons, in the same lucide hand as the rest of the app --- */

const line = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...line} aria-hidden="true">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...line} aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...line} aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEye = ({ off }: { off: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...line} aria-hidden="true">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
    {off ? <path d="m2 2 20 20" /> : null}
  </svg>
);

const IconGoogle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z" />
  </svg>
);

const IconApple = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.94-.19 1.84-.86 3.16-.83 1.14.09 2.24.53 3.09 1.42-2.83 1.7-2.38 5.44.5 6.6-.65 1.71-1.5 3.42-2.83 4.98ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
  </svg>
);
