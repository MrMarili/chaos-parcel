# Supabase — chaos-parcel

פרויקט מקושר ל: **chaos-parcel** (`gqntusyztblfoktqkeee`)

Dashboard: https://supabase.com/dashboard/project/gqntusyztblfoktqkeee

## סטטוס

שתי ה-migrations הורצו בהצלחה על הפרויקט המרוחק:

| Migration | תוכן |
|-----------|------|
| `20260706120000_initial_schema.sql` | `profiles`, `game_rooms`, `game_sessions`, `leaderboards` + RLS |
| `20260706120001_increment_profile_stats.sql` | פונקציית `increment_profile_stats` |

## פקודות שימושיות

```bash
# מתוך שורש הפרויקט
pnpm db:status    # בדיקת סטטוס migrations מקומי מול remote
pnpm db:push      # דחיפת migrations חדשים ל-remote
pnpm db:reset     # איפוס DB מקומי (דורש supabase start)
pnpm functions:deploy  # פריסת Edge Functions
```

## חיבור מחדש (מחשב אחר / CI)

```bash
supabase login
supabase link --project-ref gqntusyztblfoktqkeee
supabase db push
```

בפעם הראשונה ייתכן שיידרש **Database password** מהדשבורד:
**Project Settings → Database → Database password**

## מפתחות (אל תעשה commit)

מהדשבורד: **Project Settings → API**

| מפתח | שימוש |
|------|--------|
| Project URL | `https://gqntusyztblfoktqkeee.supabase.co` |
| `anon` `public` | Client (אם תוסיף קריאות ישירות מה-web) |
| `service_role` | Unity Host + Edge Functions בלבד — **סודי** |

העתק ל-Unity `ServerConfig` asset (ראה `unity/README.md`).

## Edge Function

לאחר מילוי מפתחות בסביבה:

```bash
supabase functions deploy save-game-results
```

Unity קורא ל:
`POST https://gqntusyztblfoktqkeee.supabase.co/functions/v1/save-game-results`

## פיתוח מקומי (אופציונלי)

```bash
supabase start    # PostgreSQL + Studio מקומי ב-docker
supabase db reset # מריץ migrations + seed על local
supabase stop
```
