import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const { userId, name, code } = await req.json();

  if (!userId || !name || !code) {
    return NextResponse.json({ error: 'Missing userId, name, or code' }, { status: 400 });
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('code', code)
    .single();

  if (gameError || !game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ game_id: game.id, user_id: userId, name })
    .select()
    .single();

  if (playerError || !player) {
    return NextResponse.json(
      { error: playerError?.message || 'Failed to join game' },
      { status: 500 },
    );
  }

  return NextResponse.json({ game, player });
}

