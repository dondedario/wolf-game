-- Fix Realtime Configuration
-- Run this in your Supabase SQL Editor to fix real-time subscriptions
-- This sets REPLICA IDENTITY and ensures tables are in the realtime publication

-- Set REPLICA IDENTITY for realtime (required for Supabase realtime to work with INSERT/UPDATE/DELETE)
-- This ensures that all changes are captured for real-time subscriptions
ALTER TABLE players REPLICA IDENTITY FULL;
ALTER TABLE games REPLICA IDENTITY FULL;
ALTER TABLE night_actions REPLICA IDENTITY FULL;

-- Ensure tables are in the realtime publication
-- These commands are idempotent - safe to run multiple times
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE night_actions;

-- Verify the tables are in the publication
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('games', 'players', 'night_actions');

-- Verify REPLICA IDENTITY is set correctly
SELECT 
  schemaname,
  tablename,
  relreplident as replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('games', 'players', 'night_actions')
  AND c.relkind = 'r';

-- Expected result: replica_identity should be 'f' (FULL) for all three tables
