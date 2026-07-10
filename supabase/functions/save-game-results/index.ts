import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface PlayerResult {
  profile_id?: string;
  nickname: string;
  score: number;
  stats?: {
    abilities_received?: number;
    bombs_exploded?: number;
    time_without_package_seconds?: number;
  };
}

interface SaveGameRequest {
  room_code: string;
  session_id?: string;
  results: PlayerResult[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: SaveGameRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.room_code || !Array.isArray(body.results) || body.results.length === 0) {
    return new Response(JSON.stringify({ error: "room_code and results are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const savedProfiles: string[] = [];

  for (const result of body.results) {
    let profileId = result.profile_id;

    if (!profileId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({ nickname: result.nickname.slice(0, 50) })
        .select("id")
        .single();

      if (profileError || !profile) {
        console.error("Profile insert error:", profileError);
        continue;
      }
      profileId = profile.id;
    }

    const bombsExploded = result.stats?.bombs_exploded ?? 0;
    const won = result.score === Math.max(...body.results.map((r) => r.score));

    await supabase.rpc("increment_profile_stats", {
      p_profile_id: profileId,
      p_won: won,
      p_bombs: bombsExploded,
    }).catch(async () => {
      const { data: existing } = await supabase
        .from("profiles")
        .select("total_wins, total_games_played, bombs_exploded")
        .eq("id", profileId)
        .single();

      await supabase
        .from("profiles")
        .update({
          total_games_played: (existing?.total_games_played ?? 0) + 1,
          total_wins: (existing?.total_wins ?? 0) + (won ? 1 : 0),
          bombs_exploded: (existing?.bombs_exploded ?? 0) + bombsExploded,
        })
        .eq("id", profileId);
    });

    await supabase.from("leaderboards").insert({
      profile_id: profileId,
      score: result.score,
      games_won: won ? 1 : 0,
    });

    savedProfiles.push(profileId);
  }

  if (body.session_id) {
    await supabase
      .from("game_sessions")
      .update({
        ended_at: new Date().toISOString(),
        player_results: body.results,
      })
      .eq("id", body.session_id);
  }

  await supabase
    .from("game_rooms")
    .update({ status: "FINISHED" })
    .eq("room_code", body.room_code);

  return new Response(
    JSON.stringify({ success: true, profile_ids: savedProfiles }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
