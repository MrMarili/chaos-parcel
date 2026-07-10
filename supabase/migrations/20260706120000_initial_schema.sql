-- Chaos Parcel initial schema

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nickname VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_wins INT DEFAULT 0,
    total_games_played INT DEFAULT 0,
    bombs_exploded INT DEFAULT 0
);

CREATE TABLE game_rooms (
    room_code VARCHAR(4) PRIMARY KEY,
    host_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'LOBBY',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT game_rooms_status_check CHECK (status IN ('LOBBY', 'IN_GAME', 'FINISHED'))
);

CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(4) REFERENCES game_rooms(room_code) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    player_results JSONB
);

CREATE TABLE leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    score INT NOT NULL,
    games_won INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_leaderboards_score ON leaderboards(score DESC);
CREATE INDEX idx_profiles_nickname ON profiles(nickname);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_public ON profiles
    FOR SELECT USING (true);

CREATE POLICY leaderboards_select_public ON leaderboards
    FOR SELECT USING (true);

-- Writes only via service role (Edge Functions / Host)
CREATE POLICY profiles_no_direct_insert ON profiles
    FOR INSERT WITH CHECK (false);

CREATE POLICY profiles_no_direct_update ON profiles
    FOR UPDATE USING (false);

CREATE POLICY leaderboards_no_direct_insert ON leaderboards
    FOR INSERT WITH CHECK (false);

CREATE POLICY leaderboards_no_direct_update ON leaderboards
    FOR UPDATE USING (false);

CREATE POLICY game_rooms_no_client_access ON game_rooms
    FOR ALL USING (false);

CREATE POLICY game_sessions_no_client_access ON game_sessions
    FOR ALL USING (false);
