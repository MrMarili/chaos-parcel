# Chaos Parcel (חבילה מתפוצצת)

Party game where players use their phones as controllers while the TV (Unity Host) runs physics-based gameplay.

## Stack

| Component | Technology |
|-----------|------------|
| Host (TV) | Unity (C#) |
| Player Controller | React + Vite (Web) |
| Real-time Server | Node.js + WebSocket (`ws`) |
| Database | Supabase (PostgreSQL + Edge Functions) |
| Shared Protocol | `@chaos-parcel/shared` (TypeScript + Zod) |

## Quick Start

```bash
pnpm install
pnpm start        # local dev (localhost only)
pnpm party        # LAN party — TV + phones on same Wi‑Fi
pnpm party:prod   # LAN party, single port (recommended for TV)
pnpm dev          # alias for pnpm start
pnpm test         # unit tests
```

## מסיבה בבית — מסך ראשי + טלפונים

1. חבר את המחשב, המסך הראשי והטלפונים **לאותה רשת Wi‑Fi**
2. הרץ:
   ```bash
   pnpm party:prod
   ```
3. במסך הראשי (דפדפן): פתח את הכתובת שמודפסת, למשל `http://192.168.1.5:3001/host`
4. שחקנים סורקים את **קוד ה-QR** מהמסך ומצטרפים מהטלפון

**טיפים:**
- `pnpm party` — פיתוח עם Vite (פורטים 5173 + 3001)
- `pnpm party:prod` — build אחד, פורט 3001 בלבד (מומלץ למסך הראשי)
- אם ה-IP לא מזוהה: `LAN_IP=192.168.1.5 pnpm party:prod`
- ודא ש-Firewall במחשב מאפשר חיבורים נכנסים לפורט 3001

## פריסה לאינטרנט (Render Free)

שרת חינמי עם HTTPS + WebSocket — טלפונים מכל רשת (לא חייבים אותו Wi‑Fi).

### פריסה ראשונה

1. דחפו את הריפו ל-GitHub
2. ב-[Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → בחרו את הריפו (`render.yaml`)
3. ודאו שהשירות הוא **Free** Web Service
4. אחרי ה-deploy: הכתובת תהיה בערך `https://chaos-parcel.onrender.com`

**פריסה חיה כרגע:** [https://chaos-parcel.onrender.com/host](https://chaos-parcel.onrender.com/host)

או ידנית: **New Web Service** → Docker → Dockerfile מהשורש → Plan: Free.

### Auto-deploy (כל commit ל-`main`)

בשירות כבר מוגדר `autoDeployTrigger: commit`, אבל צריך חיבור GitHub תקין (webhook):

1. [Render → chaos-parcel → Settings](https://dashboard.render.com/web/srv-d99956mcjfls73fuf8o0/settings)
2. ודאו שהריפו `MrMarili/chaos-parcel` מחובר ו־**Auto-Deploy** דולק
3. אם אין חיבור: [Install Render GitHub App](https://github.com/apps/render) → בחרו את הריפו

**גיבוי (מומלץ):** Deploy Hook + GitHub Action (`.github/workflows/deploy-render.yml`):

1. באותו Settings → **Deploy Hook** → העתיקו את ה-URL
2. ב-GitHub → Settings → Secrets and variables → Actions → New repository secret  
   שם: `RENDER_DEPLOY_HOOK` · ערך: ה-URL מהשלב הקודם

אחרי זה כל `git push` ל-`main` יפרוס אוטומטית.

### איך משחקים אחרי פריסה

1. טלוויזיה/מחשב: `https://YOUR-APP.onrender.com/host`
2. סרקו את ה-QR מהטלפון → `https://YOUR-APP.onrender.com/join/XXXX`
3. לא צריך אותה רשת Wi‑Fi

### Cold start (חשוב)

במסלול Free השרת **נרדם אחרי ~15 דקות** בלי תעבורה. פתיחה ראשונה אחרי שינה לוקחת **~30–60 שניות**.

**טיפ:** פתחו `/host` דקה לפני שהאורחים סורקים QR. בזמן משחק פעיל (WebSocket) השרת נשאר ער.

אל תפעילו `PARTY_MODE` בפריסה ציבורית — CORS נגזר מ-`RENDER_EXTERNAL_URL` אוטומטית.

### קבצי פריסה

| קובץ | תפקיד |
|------|--------|
| `Dockerfile` | build monorepo + הרצה עם `SERVE_CLIENT=true` |
| `render.yaml` | Blueprint — Free Web Service |
| `server/.env.example` | משתני סביבה (אופציונלי לדרוס CORS/דומיין) |

## Monetization (ads placeholders)

- **ליבה חינמית** — משחק מלא בלי תשלום
- **פרסומות** — מקומות באנר בלובי, בזירה (מסך ראשי), בין סיבובים ובסיכום; בטלפון ב־join / lobby / round_end / summary
- תשלומי Party Pass / Stripe מושהים בשלב זה (קוד השרת נשאר, בלי UI)

## Environment

Copy example env files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

## Supabase

הפרויקט מקושר ל-**chaos-parcel** (`gqntusyztblfoktqkeee`). ה-migrations כבר הורצו על ה-DB המרוחק.

פרטים מלאים: [supabase/README.md](supabase/README.md)

```bash
pnpm db:status          # migrations מקומי vs remote
pnpm db:push            # migrations חדשים
pnpm functions:deploy   # Edge Function לשמירת תוצאות
```

מפתחות API: [Dashboard → API](https://supabase.com/dashboard/project/gqntusyztblfoktqkeee/settings/api)

## Project Structure

```
packages/shared/   # WebSocket event protocol (types + Zod)
server/            # Node.js WebSocket message router
client/            # React web controller app
unity/             # Unity Host scripts + README
supabase/          # Migrations + Edge Functions
```

## Game Flow

1. Unity Host connects → creates room → displays QR code
2. Players scan QR → join via web browser → enter nickname + color
3. Host spawns ragdoll characters in lobby
4. Host starts game → 5 rounds of hot-potato parcel + chaos abilities
5. Host posts final scores to Supabase

## Unity Setup

See [unity/README.md](unity/README.md) for integrating C# scripts into your Unity project.
