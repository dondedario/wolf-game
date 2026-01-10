import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> | { code: string } }
) {
  const { userId } = await req.json();
  const params = await Promise.resolve(context.params);
  const code = params.code;

  if (!userId || !code) {
    return NextResponse.json(
      { error: 'Missing userId or game code' },
      { status: 400 }
    );
  }

  try {
    // Get the game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('code', code)
      .single();

    if (gameError || !game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if game is in night phase
    if (game.game_state !== 'night' && game.phase !== 'night') {
      return NextResponse.json(
        { error: 'Game is not in night phase' },
        { status: 400 }
      );
    }

    // Verify user is the host (optional check - could allow any player if all actions complete)
    if (game.host_id !== userId) {
      // Instead of blocking, we'll check if all actions are complete
      // If they are, allow completion; otherwise require host
    }

    // Get all alive players in the game
    const { data: alivePlayers, error: playersError } = await supabase
      .from('players')
      .select('id, name, role, alive, user_id')
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

    // Check if all alive players have submitted actions
    const actionsByPlayerId = new Map(
      actions?.map((a) => [a.player_id, a]) || []
    );

    const pendingPlayers = alivePlayers.filter(
      (p) => !actionsByPlayerId.has(p.id)
    );

    if (pendingPlayers.length > 0) {
      return NextResponse.json(
        {
          error: 'Not all players have completed their actions',
          pendingPlayers: pendingPlayers.map((p) => ({ id: p.id, name: p.name })),
        },
        { status: 400 }
      );
    }

    if (!actions || actions.length === 0) {
      return NextResponse.json(
        { error: 'No actions found to process' },
        { status: 400 }
      );
    }

    // Process actions
    // 1. Find the kill target (from werewolf actions - use last vote if multiple wolves)
    const wolfActions = actions.filter((a) => a.action_type === 'wolf_kill');
    let killTargetId: string | null = null;

    if (wolfActions.length > 0) {
      // Use the last submitted wolf action as the kill target (simple consensus)
      // In future, could implement proper voting/consensus logic
      const lastWolfAction = wolfActions[wolfActions.length - 1];
      killTargetId = lastWolfAction.target_player_id;
    }

    // 2. Find the protection target (from doctor action)
    const doctorActions = actions.filter((a) => a.action_type === 'doctor_protect');
    let protectionTargetId: string | null = null;

    if (doctorActions.length > 0) {
      // Use the last submitted doctor action
      const lastDoctorAction = doctorActions[doctorActions.length - 1];
      protectionTargetId = lastDoctorAction.target_player_id;
    }

    // 3. Check if kill target was protected
    const wasProtected = killTargetId !== null && killTargetId === protectionTargetId;
    let killedPlayerId: string | null = null;
    let killedPlayerName: string | null = null;

    if (killTargetId && !wasProtected) {
      // Apply the kill
      const { data: killedPlayer, error: killError } = await supabase
        .from('players')
        .update({ alive: false })
        .eq('id', killTargetId)
        .eq('game_id', game.id)
        .select('id, name')
        .single();

      if (killError || !killedPlayer) {
        return NextResponse.json(
          { error: 'Failed to apply kill' },
          { status: 500 }
        );
      }

      killedPlayerId = killedPlayer.id;
      killedPlayerName = killedPlayer.name;
    }

    // 4. Clear night actions (delete them after processing)
    const { error: deleteActionsError } = await supabase
      .from('night_actions')
      .delete()
      .eq('game_id', game.id);

    if (deleteActionsError) {
      console.error('Failed to clear night actions:', deleteActionsError);
      // Don't fail the request, but log the error
    }

    // 5. Update game state to 'day'
    const { error: updateGameError } = await supabase
      .from('games')
      .update({
        game_state: 'day',
        phase: 'day', // Keep phase for backward compatibility
      })
      .eq('id', game.id);

    if (updateGameError) {
      return NextResponse.json(
        { error: 'Failed to update game state' },
        { status: 500 }
      );
    }

    // Return results
    return NextResponse.json({
      success: true,
      results: {
        killedPlayerId,
        killedPlayerName,
        wasProtected,
        killTargetId: killTargetId || null,
        protectionTargetId: protectionTargetId || null,
      },
      gameState: 'day',
    });
  } catch (error: any) {
    console.error('Error completing night phase:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete night phase' },
      { status: 500 }
    );
  }
}
