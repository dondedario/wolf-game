import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> | { code: string } }
) {
  const params = await Promise.resolve(context.params);
  const code = params.code;

  if (!code) {
    return NextResponse.json(
      { error: 'Missing game code' },
      { status: 400 }
    );
  }

  try {
    // Get the game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, game_state, phase')
      .eq('code', code)
      .single();

    if (gameError || !game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Get all alive players in the game
    const { data: alivePlayers, error: playersError } = await supabase
      .from('players')
      .select('id, name, role, user_id')
      .eq('game_id', game.id)
      .eq('alive', true);

    if (playersError || !alivePlayers) {
      return NextResponse.json(
        { error: 'Failed to load players' },
        { status: 500 }
      );
    }

    // Get all night actions for this game
    const { data: actions, error: actionsError } = await supabase
      .from('night_actions')
      .select('player_id, action_type, target_player_id')
      .eq('game_id', game.id);

    if (actionsError) {
      return NextResponse.json(
        { error: 'Failed to load night actions' },
        { status: 500 }
      );
    }

    const actionsByPlayerId = new Map(
      actions?.map((a) => [a.player_id, a]) || []
    );

    // Determine which players have completed actions
    const completedPlayers = alivePlayers.filter((p) =>
      actionsByPlayerId.has(p.id)
    );
    const pendingPlayers = alivePlayers.filter(
      (p) => !actionsByPlayerId.has(p.id)
    );

    const allComplete = pendingPlayers.length === 0;

    return NextResponse.json({
      gameId: game.id,
      isNightPhase: game.game_state === 'night' || game.phase === 'night',
      allComplete,
      totalAlivePlayers: alivePlayers.length,
      completedCount: completedPlayers.length,
      pendingCount: pendingPlayers.length,
      completedPlayers: completedPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
      })),
      pendingPlayers: pendingPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
      })),
    });
  } catch (error: any) {
    console.error('Error getting night status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get night status' },
      { status: 500 }
    );
  }
}
