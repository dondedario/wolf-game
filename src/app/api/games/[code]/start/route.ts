import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

type Role = 'werewolf' | 'villager' | 'seer' | 'doctor';

interface RoleDistribution {
  werewolf: number;
  seer: number;
  doctor: number;
  villager: number;
}

function calculateRoleDistribution(playerCount: number): RoleDistribution {
  if (playerCount < 4) {
    throw new Error('Minimum 4 players required to start a game');
  }

  if (playerCount === 4) {
    return { werewolf: 1, seer: 1, doctor: 0, villager: 2 };
  } else if (playerCount <= 7) {
    return { werewolf: 2, seer: 1, doctor: 0, villager: playerCount - 3 };
  } else if (playerCount <= 10) {
    return { werewolf: 2, seer: 1, doctor: 1, villager: playerCount - 4 };
  } else {
    return { werewolf: 3, seer: 1, doctor: 1, villager: playerCount - 5 };
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function assignRoles(playerIds: string[], distribution: RoleDistribution): Map<string, Role> {
  const roles: Role[] = [];
  
  // Add werewolves
  for (let i = 0; i < distribution.werewolf; i++) {
    roles.push('werewolf');
  }
  
  // Add seer
  if (distribution.seer > 0) {
    roles.push('seer');
  }
  
  // Add doctor
  if (distribution.doctor > 0) {
    roles.push('doctor');
  }
  
  // Add villagers
  for (let i = 0; i < distribution.villager; i++) {
    roles.push('villager');
  }
  
  // Shuffle roles and assign to players
  const shuffledRoles = shuffleArray(roles);
  const roleMap = new Map<string, Role>();
  
  playerIds.forEach((playerId, index) => {
    roleMap.set(playerId, shuffledRoles[index]);
  });
  
  return roleMap;
}

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

    // Check if user is the host
    if (game.host_id !== userId) {
      return NextResponse.json(
        { error: 'Only the game host can start the game' },
        { status: 403 }
      );
    }

    // Check if game is already started
    if (game.game_state && game.game_state !== 'lobby') {
      return NextResponse.json(
        { error: 'Game has already started' },
        { status: 400 }
      );
    }

    // Get all players in the game
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', game.id);

    if (playersError || !players) {
      return NextResponse.json(
        { error: 'Failed to load players' },
        { status: 500 }
      );
    }

    // Validate minimum player count
    if (players.length < 4) {
      return NextResponse.json(
        { error: 'Minimum 4 players required to start a game' },
        { status: 400 }
      );
    }

    // Calculate role distribution
    const distribution = calculateRoleDistribution(players.length);
    const playerIds = players.map((p) => p.id);
    const roleAssignments = assignRoles(playerIds, distribution);

    // Update all players with their roles
    const updatePromises = Array.from(roleAssignments.entries()).map(([playerId, role]) =>
      supabase
        .from('players')
        .update({ role })
        .eq('id', playerId)
    );

    const updateResults = await Promise.all(updatePromises);
    const hasUpdateError = updateResults.some((result) => result.error);

    if (hasUpdateError) {
      return NextResponse.json(
        { error: 'Failed to assign roles to players' },
        { status: 500 }
      );
    }

    // Update game state to 'night'
    const { error: updateGameError } = await supabase
      .from('games')
      .update({ 
        game_state: 'night',
        phase: 'night' // Keep phase for backward compatibility
      })
      .eq('id', game.id);

    if (updateGameError) {
      return NextResponse.json(
        { error: 'Failed to update game state' },
        { status: 500 }
      );
    }

    // Fetch updated players with roles
    const { data: updatedPlayers, error: fetchPlayersError } = await supabase
      .from('players')
      .select('id, name, role, alive')
      .eq('game_id', game.id);

    if (fetchPlayersError || !updatedPlayers) {
      return NextResponse.json(
        { error: 'Failed to fetch updated players' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      game: {
        ...game,
        game_state: 'night',
        phase: 'night',
      },
      players: updatedPlayers,
      distribution,
    });
  } catch (error: any) {
    console.error('Error starting game:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start game' },
      { status: 500 }
    );
  }
}
