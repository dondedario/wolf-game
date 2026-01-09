'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Game = {
  id: string;
  code: string;
  phase: string;
};

type Player = {
  id: string;
  name: string;
  alive: boolean;
};

export default function GamePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'debug-session',
          runId: 'pre-fix-join',
          hypothesisId: 'H4',
          location: 'src/app/game/[code]/page.tsx:load:entry',
          message: 'Game page load called',
          data: { code },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      try {
        const { data: gameRow, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('code', code)
          .single();

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'pre-fix-join',
            hypothesisId: 'H5',
            location: 'src/app/game/[code]/page.tsx:load:after-game-select',
            message: 'Result of loading game by code',
            data: { hasGame: !!gameRow, gameError: gameError?.message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        if (gameError || !gameRow) {
          setError('Game not found');
          setLoading(false);
          return;
        }

        setGame({
          id: gameRow.id,
          code: gameRow.code,
          phase: gameRow.phase,
        });

        const { data: playerRows, error: playersError } = await supabase
          .from('players')
          .select('id, name, alive')
          .eq('game_id', gameRow.id)
          .order('joined_at', { ascending: true });

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'pre-fix-join',
            hypothesisId: 'H6',
            location: 'src/app/game/[code]/page.tsx:load:after-players-select',
            message: 'Result of loading players for game',
            data: { hasPlayers: !!playerRows, playersError: playersError?.message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        if (playersError || !playerRows) {
          setError('Failed to load players');
          setLoading(false);
          return;
        }

        setPlayers(playerRows as Player[]);
      } catch (e: any) {
        setError(e.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    if (code) {
      load();
    }
  }, [code]);

  useEffect(() => {
    if (!game?.id) return;

    const channel = supabase
      .channel(`players-game-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const newPlayer = payload.new as any;
          setPlayers((prev) => {
            if (prev.some((p) => p.id === newPlayer.id)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: newPlayer.id,
                name: newPlayer.name,
                alive: newPlayer.alive,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <p>Loading game...</p>
      </main>
    );
  }

  if (error || !game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-red-200 text-sm">{error || 'Game not found'}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="mb-2 text-2xl font-semibold text-center">Game {game.code}</h1>
        <p className="mb-4 text-center text-sm text-slate-400">
          Phase:{' '}
          <span className="font-semibold text-indigo-300">
            {game.phase}
          </span>
        </p>

        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <ul className="space-y-1 text-sm">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-3 py-2"
            >
              <span>{p.name}</span>
              <span className={p.alive ? 'text-emerald-400 text-xs' : 'text-slate-500 text-xs'}>
                {p.alive ? 'Alive' : 'Dead'}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[11px] text-slate-500">
          This is the lobby view for now. You can host/join from multiple tabs or devices and see
          players appear here.
        </p>
      </div>
    </main>
  );
}

