import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

type ActionType = 'seer_vision' | 'wolf_kill' | 'doctor_protect' | 'villager_ready';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> | { code: string } }
) {
  const { userId, targetPlayerId } = await req.json();
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

    // Get the current player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, role, alive, game_id')
      .eq('game_id', game.id)
      .eq('user_id', userId)
      .single();

    if (playerError || !player) {
      return NextResponse.json(
        { error: 'Player not found in this game' },
        { status: 404 }
      );
    }

    // Check if player is alive
    if (!player.alive) {
      return NextResponse.json(
        { error: 'Dead players cannot perform actions' },
        { status: 400 }
      );
    }

    // Determine action type based on role
    let actionType: ActionType;
    switch (player.role) {
      case 'seer':
        actionType = 'seer_vision';
        break;
      case 'werewolf':
        actionType = 'wolf_kill';
        break;
      case 'doctor':
        actionType = 'doctor_protect';
        break;
      case 'villager':
        actionType = 'villager_ready';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid role for night actions' },
          { status: 400 }
        );
    }

    // Validate target for roles that need it
    if (actionType !== 'villager_ready' && !targetPlayerId) {
      return NextResponse.json(
        { error: 'Target player ID is required for this action' },
        { status: 400 }
      );
    }

    // If target is required, validate it
    if (targetPlayerId) {
      // Get all alive players in the game
      const { data: alivePlayers, error: alivePlayersError } = await supabase
        .from('players')
        .select('id, role, alive')
        .eq('game_id', game.id)
        .eq('alive', true);

      if (alivePlayersError || !alivePlayers) {
        return NextResponse.json(
          { error: 'Failed to validate target player' },
          { status: 500 }
        );
      }

      const targetPlayer = alivePlayers.find((p) => p.id === targetPlayerId);
      if (!targetPlayer) {
        return NextResponse.json(
          { error: 'Target player not found or not alive' },
          { status: 400 }
        );
      }

      // Wolves cannot target other wolves
      if (actionType === 'wolf_kill' && targetPlayer.role === 'werewolf') {
        return NextResponse.json(
          { error: 'Werewolves cannot target other werewolves' },
          { status: 400 }
        );
      }

      // Cannot target yourself
      if (targetPlayerId === player.id) {
        return NextResponse.json(
          { error: 'Cannot target yourself' },
          { status: 400 }
        );
      }
    }

    // Check if action exists (don't use .single() as it throws when no row found)
    const { data: existingActions, error: checkError } = await supabase
      .from('night_actions')
      .select('id')
      .eq('game_id', game.id)
      .eq('player_id', player.id)
      .limit(1);

    if (checkError) {
      console.error('Error checking for existing action:', checkError);
      
      // Check if this is a table missing error (PGRST205 = table not found in schema cache)
      if (checkError.code === 'PGRST205' || checkError.message?.includes('night_actions') || checkError.message?.includes('schema cache')) {
        return NextResponse.json(
          { 
            error: 'Database table missing',
            details: 'The night_actions table does not exist in your Supabase database. Please run the migration file (database-migrations.sql) in your Supabase SQL editor.',
            technicalError: checkError.message,
            code: checkError.code
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to check existing action', details: checkError.message },
        { status: 500 }
      );
    }

    const existingAction = existingActions && existingActions.length > 0 ? existingActions[0] : null;
    let action;
    let actionError;

    if (existingAction) {
      // Update existing action
      const { data: updatedAction, error: updateError } = await supabase
        .from('night_actions')
        .update({
          action_type: actionType,
          target_player_id: targetPlayerId || null,
        })
        .eq('id', existingAction.id)
        .select()
        .single();
      
      action = updatedAction;
      actionError = updateError;
      
      if (actionError) {
        console.error('Error updating night action:', {
          error: actionError,
          message: actionError?.message,
          details: actionError?.details,
          hint: actionError?.hint,
          code: actionError?.code,
        });
      }
    } else {
      // Insert new action
      const { data: newAction, error: insertError } = await supabase
        .from('night_actions')
        .insert({
          game_id: game.id,
          player_id: player.id,
          action_type: actionType,
          target_player_id: targetPlayerId || null,
        })
        .select()
        .single();
      
      action = newAction;
      actionError = insertError;
      
      // If insert fails due to unique constraint (race condition), try updating instead
      if (actionError && (actionError.code === '23505' || actionError.message?.includes('duplicate key'))) {
        console.log('Insert failed due to unique constraint, retrying as update...');
        const { data: retryActions } = await supabase
          .from('night_actions')
          .select('id')
          .eq('game_id', game.id)
          .eq('player_id', player.id)
          .limit(1);
        
        if (retryActions && retryActions.length > 0) {
          const { data: updatedAction, error: updateError } = await supabase
            .from('night_actions')
            .update({
              action_type: actionType,
              target_player_id: targetPlayerId || null,
            })
            .eq('id', retryActions[0].id)
            .select()
            .single();
          
          action = updatedAction;
          actionError = updateError;
        }
      }
      
      if (actionError) {
        console.error('Error inserting night action:', {
          error: actionError,
          message: actionError?.message,
          details: actionError?.details,
          hint: actionError?.hint,
          code: actionError?.code,
          gameId: game.id,
          playerId: player.id,
          actionType,
          targetPlayerId
        });
      }
    }

    if (actionError || !action) {
      return NextResponse.json(
        { 
          error: 'Failed to save night action',
          details: actionError?.message || actionError?.details || 'Unknown error',
          code: actionError?.code || 'UNKNOWN'
        },
        { status: 500 }
      );
    }

    // For seer, also return the target's role (if they're a werewolf, reveal it; otherwise show as villager)
    let seerResult = null;
    if (actionType === 'seer_vision' && targetPlayerId) {
      const { data: targetPlayer, error: targetError } = await supabase
        .from('players')
        .select('role')
        .eq('id', targetPlayerId)
        .single();

      if (!targetError && targetPlayer) {
        // Seer can only see if someone is a werewolf or not
        // If they're a werewolf, reveal it; otherwise show as "villager" (even if seer/doctor)
        seerResult = {
          targetPlayerId,
          isWerewolf: targetPlayer.role === 'werewolf',
        };
      }
    }

    return NextResponse.json({
      success: true,
      action: {
        id: action.id,
        actionType: action.action_type,
        targetPlayerId: action.target_player_id,
      },
      seerResult,
    });
  } catch (error: any) {
    console.error('Error submitting night action:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit night action' },
      { status: 500 }
    );
  }
}
