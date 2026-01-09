import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const { userId, name, code } = await req.json();

  // Debug logging can be noisy or fail if the local ingest server is not running.
  // Keep this behind a simple environment flag so it never interferes with the API response.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_AGENT_LOGS === 'true') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix-join',
        hypothesisId: 'H1',
        location: 'src/app/api/games/join/route.ts:POST:entry',
        message: 'Join API called',
        data: { hasUserId: !!userId, hasName: !!name, code },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  if (!userId || !name || !code) {
    return NextResponse.json({ error: 'Missing userId, name, or code' }, { status: 400 });
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('code', code)
    .single();

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_AGENT_LOGS === 'true') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix-join',
        hypothesisId: 'H2',
        location: 'src/app/api/games/join/route.ts:POST:after-game-select',
        message: 'Result of selecting game by code',
        data: { code, gameError: gameError?.message, hasGame: !!game },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  if (gameError || !game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
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
        runId: 'pre-fix-join',
        hypothesisId: 'H3',
        location: 'src/app/api/games/join/route.ts:POST:after-player-insert',
        message: 'Result of inserting joined player',
        data: { playerError: playerError?.message, hasPlayer: !!player },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  if (playerError || !player) {
    return NextResponse.json(
      { error: playerError?.message || 'Failed to join game' },
      { status: 500 },
    );
  }

  return NextResponse.json({ game, player });
}

