#!/usr/bin/env bash
# ARI — קומיטים מפוצלים לעבודה של 17–18 באוגוסט.
#
# מריצים פעם אחת מתוך תיקיית הפרויקט:
#   bash commit-stage-1.sh
#
# הסקריפט לא דוחף בעצמו. הוא עוצר לפני git push כדי שתראה מה נוצר.

set -e
cd "$(dirname "$0")"

if [ -f .git/index.lock ]; then
  echo "→ מסיר index.lock תקוע"
  rm -f .git/index.lock
fi

echo "→ מוודא ש-.env.local לא נכנס לגיט"
grep -qxF '.env.local' .gitignore 2>/dev/null || echo '.env.local' >> .gitignore
grep -qxF '_incoming/' .gitignore 2>/dev/null || echo '_incoming/' >> .gitignore
git rm --cached .env.local 2>/dev/null || true

commit () {  # commit <message> <paths...>
  local msg="$1"; shift
  local found=0
  for p in "$@"; do [ -e "$p" ] && found=1; done
  if [ "$found" = "1" ]; then
    git add -- "$@" 2>/dev/null || true
    if ! git diff --cached --quiet; then
      git commit -q -m "$msg"
      echo "  ✓ $msg"
    fi
  fi
}

echo "→ יוצר קומיטים"

commit "Add training-load engine: HRSS, thresholds, PMC and readiness" \
  src/lib/planning/load.ts src/lib/planning/thresholds.ts \
  src/lib/planning/pmc.ts src/lib/planning/acwr.ts \
  src/lib/planning/readiness.ts src/lib/readiness/ \
  src/actions/readiness.ts src/lib/planning/__tests__/

commit "Fix pace formatting: 4:60 was possible; unify six copies behind one helper" \
  src/lib/format/ src/lib/screens/ tools/dc-to-jsx.py tsconfig.json

commit "Show an empty dashboard instead of demo data for accounts with no history" \
  src/components/dashboard/EmptyDashboard.tsx

commit "Add intervals.icu as a connectable data source, with owner-only RLS" \
  supabase/migrations/0003_provider_connections.sql \
  supabase/migrations/0002_profile_physiology.sql \
  src/lib/wellness/ src/actions/providers.ts \
  src/components/settings/ src/lib/providers/

commit "Generalise activities to any source, not just Strava" \
  supabase/migrations/0004_activity_sources.sql \
  src/actions/sync.ts src/app/api/cron/sync-strava/route.ts

commit "Derive pace shape, personal records and cardiac drift from activity streams" \
  supabase/migrations/0005_activity_stream_summaries.sql \
  src/lib/dashboard/sparkline.ts src/lib/dashboard/personalRecords.ts \
  src/lib/dashboard/__tests__/

commit "Write the coaching narrative from the athlete's own numbers" \
  src/lib/narrative/ src/components/dashboard/ReasoningPanel.tsx

commit "Size training plans from the athlete's current volume, not a fixed table" \
  src/lib/planning/capacity.ts src/lib/planning/readCapacity.ts \
  src/lib/planning/generatePlan.ts src/lib/planning/paces.ts \
  src/actions/plan.ts src/lib/dashboard/realPlan.ts

commit "Wire the dashboard to real data" \
  src/app/ src/components/ src/lib/ src/types/ scripts/ package.json

commit "Add research notes and session reports" docs/

git add -A -- . ':!_incoming' ':!.env.local' 2>/dev/null || true
git diff --cached --quiet || git commit -q -m "Remaining stage-1 work"

echo
echo "→ נוצרו הקומיטים הבאים:"
git log --oneline -12
echo
echo "→ בדיקה אחרונה: האם .env.local נכנס בטעות?"
if git log --all --name-only --pretty=format: | grep -qx ".env.local"; then
  echo "  ✗ .env.local נמצא בהיסטוריה — עצור ותגיד לי"
else
  echo "  ✓ נקי"
fi
echo
echo "עכשיו, אם הכל נראה טוב:   git push"
