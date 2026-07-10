CREATE OR REPLACE FUNCTION increment_profile_stats(
  p_profile_id UUID,
  p_won BOOLEAN,
  p_bombs INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET
    total_games_played = total_games_played + 1,
    total_wins = total_wins + CASE WHEN p_won THEN 1 ELSE 0 END,
    bombs_exploded = bombs_exploded + p_bombs
  WHERE id = p_profile_id;
END;
$$;
