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

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({ code, host_id: userId })
    .select()
    .single();

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

  if (playerError || !player) {
    return NextResponse.json(
      { error: playerError?.message || 'Failed to create host player' },
      { status: 500 },
    );
  }

  return NextResponse.json({ game, player });
}


