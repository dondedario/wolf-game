-- Database schema updates for game setup and role assignment
-- Run these migrations on your Supabase database

-- Add role column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS role TEXT;

-- Add game_state column to games table (using game_state for clarity, phase can be kept for compatibility)
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_state TEXT DEFAULT 'lobby';

-- Add config JSONB column to games table for game settings
ALTER TABLE games ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Update existing games to have lobby state if game_state is null
UPDATE games SET game_state = 'lobby' WHERE game_state IS NULL;

-- Create night_actions table for tracking player actions during night phase
CREATE TABLE IF NOT EXISTS night_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('seer_vision', 'wolf_kill', 'doctor_protect', 'villager_ready')),
  target_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, player_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_night_actions_game_id ON night_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_night_actions_player_id ON night_actions(player_id);
