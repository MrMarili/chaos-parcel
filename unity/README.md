# Chaos Parcel — Unity Host Setup

## Prerequisites

- Unity 2022.3 LTS or newer
- [NativeWebSocket](https://github.com/endel/NativeWebSocket) package

## Install NativeWebSocket

1. Open **Window > Package Manager**
2. Click **+** > **Add package from git URL**
3. Enter: `https://github.com/endel/NativeWebSocket.git#upm`

## Project Setup

1. Create a new 3D Unity project (or open existing)
2. Copy `unity/Scripts/` into your project's `Assets/Scripts/ChaosParcel/`
3. Create scene objects:

| GameObject | Components |
|------------|------------|
| NetworkManager | `NetworkManager` |
| RoomManager | `RoomManager` + UI Text for room code |
| PlayerSpawner | `PlayerSpawner` + player prefab reference |
| InputReceiver | `InputReceiver` |
| AbilityHandler | `AbilityHandler` |
| GameLoopManager | `GameLoopManager` + `SupabaseScoreSaver` |

## Player Prefab

Create a capsule or ragdoll with:
- `Rigidbody`
- `Collider`
- `PlayerController`
- Colored `Renderer` for character color

Assign to `PlayerSpawner.playerPrefab`.

## Server Config

1. **Assets > Create > Chaos Parcel > Server Config**
2. Set values from [Supabase Dashboard → API](https://supabase.com/dashboard/project/gqntusyztblfoktqkeee/settings/api):
   - **Supabase URL:** `https://gqntusyztblfoktqkeee.supabase.co`
   - **Service Role Key:** (from dashboard — never commit)
3. Assign to `SupabaseScoreSaver.config`
4. **Never commit** `ServerConfig.asset` to git

## WebSocket URL

Set on `NetworkManager`:
- Local dev: `ws://localhost:3001/ws?role=host`
- Production: `wss://your-server.com/ws?role=host`

## Game Flow

1. Play scene → Host auto-connects and sends `ROOM_CREATE`
2. Display room code + QR (join URL) on TV
3. Players join via web → `PLAYER_JOINED` → ragdolls spawn and fall
4. Press **Start** → 5 rounds begin
5. Game end → scores POST to Supabase Edge Function

## Collision-Based Pass

For physics pass (without PASS button), add a trigger collider script that calls `GameLoopManager.PassPackage()` on player-player collision when holder touches another player.
