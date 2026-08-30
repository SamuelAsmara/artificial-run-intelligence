# Runi — Run with Intelligence

מאמן ריצה מבוסס AI — תכנון periodization קדימה ומודעות להתאוששות (ACWR + cardiac drift).
תרגיל סיום | Internet Technologies | Runi CS 2026 | דדליין: 06.09.2026

מסמכי האפיון המלאים נמצאים ב-`docs/`. מסמך המעקב: `התקדמות הפרויקט.md`.

Stack: Next.js (App Router) + TypeScript + Supabase (Postgres + Auth) + Vercel.

---

## מה כבר בנוי (שלב 2)

- שלד Next.js + TypeScript מלא (`src/app`, `src/components`, `src/lib`, `src/actions`, `src/types`)
- לוגיקה עסקית עם בדיקות Vitest ירוקות: `generatePlan` (periodization), `calculateACWR`, `detectCardiacDrift`, `decideAdjustments`
- שכבת ולידציה (Zod) לפי מסמך התכנון הטכני §9
- Server Actions: `createGoalRace`, `generatePlanAction`, `adjustPlan`, `upgradeToPremium`
- API Routes: Strava OAuth callback, Health Webhook, Vercel Cron sync
- Middleware להגנת route (מפנה ל-`/login` בלי session)
- Migration SQL מלא לכל 8 הטבלאות + RLS (`supabase/migrations/0001_init.sql`)
- `vercel.json` עם הגדרת ה-Cron היומי

מה **עוד לא** בנוי (שלב 3 — מימוש): כל העמודים/קומפוננטות בפועל (dashboard, plan, onboarding וכו') — כרגע יש רק עמוד בית זמני כדי שה-build יעבור.

---

## הרצה מקומית

```bash
npm install
cp .env.example .env.local   # ואז למלא ערכים אמיתיים — ראו למטה
npm run dev                  # http://localhost:3000
npm test                     # Vitest — הלוגיקה העסקית
npm run build                # בדיקת build מלאה (מה ש-Vercel ירוץ)
```

---

## Runbook — 3 הפעולות שחייבות להתבצע דרך המכשיר/דפדפן שלך

הסביבה שבה נבנה הקוד הזה מבודדת (בלי גישה לחשבונות שלך וברשת חסומה),
אז שלוש הפעולות הבאות **חייבות** להתבצע ידנית. הכל מוכן מהצד שלי —
אלו הצעדים המדויקים.

### 1. יצירת ריפו GitHub ודחיפת הקוד

```bash
cd "<תיקיית הפרויקט אצלך>"
git init                     # אם עוד לא בוצע
git add .
git commit -m "שלב 2: הקמת פרויקט Next.js + TS, סכימת DB, RLS"

gh repo create artificial-run-intelligence --private --source=. --remote=origin
# אלטרנטיבה בלי gh CLI: צור ריפו ריק ב-github.com/new, ואז:
# git remote add origin git@github.com:<username>/artificial-run-intelligence.git

git branch -M main
git push -u origin main
```

### 2. יצירת פרויקט Supabase + הרצת ה-Migration

1. היכנס ל-[supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**.
2. בחר שם, סיסמת DB (שמור אותה בצד), ואזור קרוב (למשל `eu-central-1`).
3. אחרי שהפרויקט קם: **SQL Editor** → הדבק את כל התוכן של
   `supabase/migrations/0001_init.sql` → **Run**.
   ודא שאין שגיאות — הוא יוצר את כל 8 הטבלאות, האינדקסים, ה-trigger
   ליצירת `profiles`, ואת כל מדיניות ה-RLS בבת אחת.
4. **Project Settings → API** — העתק ל-`.env.local`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (סודי! לעולם לא ל-Git, לעולם לא ללקוח)
5. (אופציונלי אך מומלץ) חבר את הפרויקט עם ה-CLI כדי לייצר טיפוסים אמיתיים
   במקום ה-placeholder שנכתב ידנית:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # מה-URL של הפרויקט
   npx supabase gen types typescript --project-id <project-ref> > src/types/database.types.ts
   ```

### 3. רישום אפליקציית Strava API

1. היכנס ל-[strava.com/settings/api](https://www.strava.com/settings/api) עם חשבון ה-Strava שלך.
2. מלא: **Application Name** (למשל "Artificial Run Intelligence — Dev"),
   **Category** (Training), **Website** (בשלב פיתוח: `http://localhost:3000`,
   אחרי פריסה: כתובת ה-Vercel), **Authorization Callback Domain** — **רק הדומיין, בלי https:// ובלי נתיב**:
   - פיתוח מקומי: `localhost`
   - פרודקשן: `<your-app>.vercel.app` (או דומיין מותאם אישית)
3. אחרי היצירה תקבל **Client ID** ו-**Client Secret** → מלא ב-`.env.local`:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
4. אין צורך להגדיר את ה-redirect URI המלא בטופס של Strava עצמו — רק את
   הדומיין. הנתיב המלא (`/api/auth/strava/callback`) נבנה בקוד
   (`src/lib/strava/api.ts` → `getStravaAuthorizeUrl`) מתוך `NEXT_PUBLIC_APP_URL`.
5. שים לב: אם תרשום אפליקציה נפרדת לפרודקשן (מומלץ, כי ה-callback domain
   שונה מ-localhost), תצטרך Client ID/Secret נפרדים ב-Vercel Environment
   Variables לעומת `.env.local` המקומי.

---

## שאר משתני הסביבה שאתה קובע בעצמך (לא דורשים חשבון חיצוני)

```bash
openssl rand -hex 32   # הרץ פעמיים — פעם ל-HEALTH_WEBHOOK_SECRET, פעם ל-CRON_SECRET
```

- `HEALTH_WEBHOOK_SECRET` — נבדק ב-`X-Webhook-Secret` header של `/api/webhooks/health` (מסמך אבטחה §6).
- `CRON_SECRET` — Vercel שולח אותו אוטומטית כ-`Authorization: Bearer <CRON_SECRET>`
  בכל הפעלה של Cron Job, ברגע שהוא מוגדר כמשתנה סביבה בפרויקט — אין צורך בהגדרה נוספת בצד Vercel.

---

## פריסה ל-Vercel (שלב 5, לעתיד)

1. Import Project מה-ריפו ב-GitHub.
2. הוסף את כל המשתנים מ-`.env.example` תחת Project Settings → Environment Variables
   (כולל ערכי production נפרדים אם רשמת אפליקציית Strava שנייה).
3. `vercel.json` כבר מגדיר את ה-Cron היומי (`/api/cron/sync-strava`, 04:00 UTC) — Vercel יזהה אותו אוטומטית בפריסה.
4. עדכן ב-Strava (settings/api) ו-ב-`NEXT_PUBLIC_APP_URL` (production env var) לכתובת ה-Vercel האמיתית.
