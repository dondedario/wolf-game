import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

function generateCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { userId, name } = await req.json();

  if (!userId || !name) {
    return NextResponse.json({ error: 'Missing userId or name' }, { status: 400 });
  }

  const code = generateCode();

  // Debug logging can be noisy or fail if the local ingest server is not running.
  // Keep this behind a simple environment flag so it never interferes with the API response.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_AGENT_LOGS === 'true') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'src/app/api/games/route.ts:POST:before-insert',
        message: 'Creating game',
        data: { userId, name, code },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({ code, host_id: userId })
    .select()
    .single();

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_AGENT_LOGS === 'true') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H2',
        location: 'src/app/api/games/route.ts:POST:after-game-insert',
        message: 'Result of inserting game',
        data: { gameError: gameError?.message, hasGame: !!game },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  if (gameError || !game) {
    return NextResponse.json(
      { error: gameError?.message || 'Failed to create game' },
      { status: 500 },
    );
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ game_id: game.id, user_id: userId, name })
    .select()
    .single();

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_AGENT_LOGS === 'true') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'src/app/api/games/route.ts:POST:after-player-insert',
        message: 'Result of inserting player',
        data: { playerError: playerError?.message, hasPlayer: !!player },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  if (playerError || !player) {
    return NextResponse.json(
      { error: playerError?.message || 'Failed to create host player' },
      { status: 500 },
    );
  }

  return NextResponse.json({ game, player });
}


