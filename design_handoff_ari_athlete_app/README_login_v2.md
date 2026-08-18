# ARI — Login / Sign-up screen — standalone handoff

Open `ARI Login.dc.html` directly in a browser (keep `support.js`, `image-slot.js` and `uploads/` next to it — support files are prototype harness only, do not port).

## Screen spec (from the user's Figma, node 2:20)
- Full-bleed background photo (`uploads/pasted-1787076738630-0.png`, night runners, object-fit: cover, position: fixed) with a subtle brand-blue filter overlay: linear-gradient(160deg, rgba(20,36,61,.38), rgba(8,10,14,.3) 55%, rgba(78,142,247,.14)).
- Centered glass card: width min(360px, 94vw), radius 18px, background rgba(22,30,46,.5), backdrop-blur 18px, inset 1px ring rgba(255,255,255,.12), shadow 0 24px 80px rgba(0,0,0,.4). Page scrolls if the card is taller than the viewport (grid + safe center).
- Title: Archivo Black 20px, uppercase, letter-spacing -0.4px — "PRECISION IN EVERY STEP"; subtitle Inter 12.5px #94a3b8 — "Measured, explained, adjusted."
- Pill tab bar (Log In / Sign Up): h38, radius 100, bg rgba(15,23,42,.55), padding 3; active tab bg rgba(255,255,255,.12) white 600, inactive #94a3b8 500.
- Fields: label Inter 600 10.5px uppercase ls 1.1 #94a3b8; input h41 radius 8 bg rgba(15,23,42,.6) border #334155, leading lucide icon (mail/lock/user), password has an eye toggle; focus = accent border + 8px accent glow. Placeholder #64748b.
- Log-in extras: "Remember device" checkbox (accent fill when on) + "Forgot password?" accent link.
- Sign-up extras: Username field + role picker (Athlete "Train with an adaptive plan" / Coach "Manage a roster of athletes"), selected = elevated bg + accent border. Validation: username required (signup), valid email, password >= 6 chars; inline error in --color-negative.
- Primary CTA: full-width pill h42, accent bg, text 700 13.5px ls .5 accent-ink — "Log in" / "Create account"; shadow 0 4px 16px accent 20%.
- Divider "OR CONNECT WITH" (11px ls 1px #64748b) then Google / Apple outline pills h38 radius 100 border rgba(255,255,255,.12), white 12px labels + logo glyphs.
- Accent = site blue #4e8ef7 (NOT the Figma cyan — deliberate decision to match the app), --color-accent-ink #061225. All colors via the shared :root block at the top of the file.
- Flows after submit (prototype): athlete -> empty dashboard zero-state with "Build my training plan" (goal race/date/target/days modal) and "I have a coach code" (QR + code join modal); coach signup -> welcome card -> coach dashboard link.
