-- Enable Realtime for tables
-- This must be run in your Supabase SQL Editor to enable real-time subscriptions

-- Set REPLICA IDENTITY for realtime (required for Supabase realtime to work with INSERT/UPDATE/DELETE)
ALTER TABLE players REPLICA IDENTITY FULL;
ALTER TABLE games REPLICA IDENTITY FULL;
ALTER TABLE night_actions REPLICA IDENTITY FULL;

-- Enable Realtime for games table
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- Enable Realtime for players table
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Enable Realtime for night_actions table
ALTER PUBLICATION supabase_realtime ADD TABLE night_actions;

-- Verify the tables are in the publication (optional check)
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('games', 'players', 'night_actions');
