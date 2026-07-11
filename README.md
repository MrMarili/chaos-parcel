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
