# Chaos Parcel (חבילה עוברת)

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
pnpm start        # one command: shared build + server + client
pnpm dev          # alias for pnpm start
pnpm dev:server   # WebSocket server only (port 3001)
pnpm dev:client   # Web client only (port 5173)
pnpm test         # unit tests
```

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
