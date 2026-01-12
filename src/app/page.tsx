'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem('userId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem('userId', id);
  return id;
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

  const handleHost = async () => {
    if (!name || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch (parseErr: any) {
        // This is where errors like "Unexpected token < in JSON at position 0" would surface
        const message =
          parseErr?.message && typeof parseErr.message === 'string'
            ? `Response parse error: ${parseErr.message}`
            : 'Failed to parse server response. Check console/network tabs.';
        console.error('Failed to parse /api/games response as JSON', parseErr);
        setError(message);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create game');
      }

      localStorage.setItem('playerId', data.player.id);
      router.push(`/game/${data.game.code}`);
    } catch (e: any) {
      console.error('Error while hosting game', e);
      setError(e?.message || 'Something went wrong while creating the game');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!name || !code || !userId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/games/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, code }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch (parseErr: any) {
        const message =
          parseErr?.message && typeof parseErr.message === 'string'
            ? `Join response parse error: ${parseErr.message}`
            : 'Failed to parse join response. Check console/network tabs.';
        console.error('Failed to parse /api/games/join response as JSON', parseErr);
        setError(message);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to join game');
      }

      localStorage.setItem('playerId', data.player.id);
      router.push(`/game/${data.game.code}`);
    } catch (e: any) {
      console.error('Error while joining game', e);
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="mb-2 text-2xl font-semibold text-center">Werewolf Lobby</h1>
        <p className="mb-4 text-center text-sm text-slate-400">
          Enter your name, then host a new game or join with a code.
        </p>

        {error && (
          <p className="mb-3 rounded border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <label className="block text-sm mb-1">Name</label>
        <input
          className="mb-4 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Villager name"
        />

        <button
          className="mb-4 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
          onClick={handleHost}
          disabled={!name || loading}
        >
          {loading ? 'Working...' : 'Host new game'}
        </button>

        <div className="my-4 h-px bg-slate-800" />

        <label className="block text-sm mb-1">Game code</label>
        <input
          className="mb-3 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD12"
        />

        <button
          className="w-full rounded-md bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-40"
          onClick={handleJoin}
          disabled={!name || !code || loading}
        >
          {loading ? 'Working...' : 'Join game'}
        </button>
      </div>
    </main>
  );
}
