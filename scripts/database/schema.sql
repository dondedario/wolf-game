-- Complete database schema for WOLF game
-- This file can be run on a fresh database or existing database (idempotent)
-- All statements use IF NOT EXISTS to allow safe re-execution

-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  host_id UUID NOT NULL,
  game_state TEXT DEFAULT 'lobby',
  phase TEXT, -- Kept for backward compatibility
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT, -- 'werewolf', 'villager', 'seer', 'doctor', or NULL
  alive BOOLEAN DEFAULT true,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Set REPLICA IDENTITY for realtime (required for Supabase realtime to work)
ALTER TABLE players REPLICA IDENTITY FULL;

-- Create night_actions table
CREATE TABLE IF NOT EXISTS night_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('seer_vision', 'wolf_kill', 'doctor_protect', 'villager_ready')),
  target_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, player_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_night_actions_game_id ON night_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_night_actions_player_id ON night_actions(player_id);
CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);

-- Migration: Add role column to players table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'players' AND column_name = 'role'
  ) THEN
    ALTER TABLE players ADD COLUMN role TEXT;
  END IF;
END $$;

-- Migration: Add game_state column to games table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'games' AND column_name = 'game_state'
  ) THEN
    ALTER TABLE games ADD COLUMN game_state TEXT DEFAULT 'lobby';
  END IF;
END $$;

-- Migration: Add phase column to games table (if not exists) - for backward compatibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'games' AND column_name = 'phase'
  ) THEN
    ALTER TABLE games ADD COLUMN phase TEXT;
  END IF;
END $$;

-- Migration: Add config column to games table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'games' AND column_name = 'config'
  ) THEN
    ALTER TABLE games ADD COLUMN config JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Migration: Update existing games to have lobby state if game_state is null
UPDATE games SET game_state = 'lobby' WHERE game_state IS NULL;

-- Migration: Add alive column to players table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'players' AND column_name = 'alive'
  ) THEN
    ALTER TABLE players ADD COLUMN alive BOOLEAN DEFAULT true;
    UPDATE players SET alive = true WHERE alive IS NULL;
  END IF;
END $$;

-- Migration: Add joined_at column to players table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'players' AND column_name = 'joined_at'
  ) THEN
    ALTER TABLE players ADD COLUMN joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    UPDATE players SET joined_at = COALESCE(created_at, NOW()) WHERE joined_at IS NULL;
  END IF;
END $$;
