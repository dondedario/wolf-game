'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Game = {
  id: string;
  code: string;
  phase: string;
  game_state?: string;
  host_id?: string;
};

type Player = {
  id: string;
  name: string;
  alive: boolean;
  role?: string;
  user_id?: string;
};

function getUserId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('userId') || '';
}

export default function GamePage() {
  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:GamePage:init',message:'GamePage component initialized',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion

  const params = useParams<{ code: string }>();
  const code = params.code;
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [startingGame, setStartingGame] = useState(false);
  
  // Night phase state
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [actionSubmitted, setActionSubmitted] = useState(false);
  const [seerResult, setSeerResult] = useState<{ targetName: string; isWerewolf: boolean } | null>(null);
  const [nightStatus, setNightStatus] = useState<{
    allComplete: boolean;
    completedCount: number;
    totalAlivePlayers: number;
  } | null>(null);
  const [nightResults, setNightResults] = useState<{
    killedPlayerName: string | null;
    wasProtected: boolean;
  } | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    setCurrentUserId(getUserId());
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: gameRow, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('code', code)
          .single();

        if (gameError || !gameRow) {
          setError('Game not found');
          setLoading(false);
          return;
        }

        setGame({
          id: gameRow.id,
          code: gameRow.code,
          phase: gameRow.phase || gameRow.game_state || 'lobby',
          game_state: gameRow.game_state || gameRow.phase || 'lobby',
          host_id: gameRow.host_id,
        });

        const { data: playerRows, error: playersError } = await supabase
          .from('players')
          .select('id, name, alive, role, user_id')
          .eq('game_id', gameRow.id)
          .order('joined_at', { ascending: true });

        if (playersError || !playerRows) {
          setError('Failed to load players');
          setLoading(false);
          return;
        }

        setPlayers(playerRows as Player[]);
        
        // Find current player
        const userId = getUserId();
        const currentPlayerData = playerRows.find((p: any) => p.user_id === userId);
        if (currentPlayerData) {
          setCurrentPlayer(currentPlayerData as Player);
        }
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

    // Subscribe to game state changes
    const gameChannel = supabase
      .channel(`game-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          const updatedGame = payload.new as any;
          const newState = updatedGame.phase || updatedGame.game_state || 'lobby';
          const prevState = game?.game_state || game?.phase || 'lobby';
          
          setGame((prev) => ({
            ...prev!,
            phase: newState,
            game_state: newState,
          }));

          // Handle night-to-day transition
          if (prevState === 'night' && newState === 'day') {
            // Reset night action state
            setActionSubmitted(false);
            setSelectedTargetId(null);
            setSeerResult(null);
            setNightStatus(null);
            
            // Reload players to get updated alive status and show who died
            setTimeout(() => {
              if (code) {
                const reload = async () => {
                  const { data: gameRow } = await supabase
                    .from('games')
                    .select('id')
                    .eq('code', code)
                    .single();
                  
                  if (gameRow) {
                    const { data: playerRows } = await supabase
                      .from('players')
                      .select('id, name, alive, role, user_id')
                      .eq('game_id', gameRow.id)
                      .order('joined_at', { ascending: true });
                    
                    if (playerRows) {
                      // Find who died (was alive before, now dead)
                      const previousPlayers = players.filter((p) => p.alive);
                      const deadPlayers = playerRows.filter(
                        (p: any) => !p.alive && previousPlayers.some((prev) => prev.id === p.id && prev.alive)
                      );
                      
                      // Show notification if someone died (if we don't already have night results)
                      if (deadPlayers.length > 0 && !nightResults) {
                        setNightResults({
                          killedPlayerName: deadPlayers[0].name,
                          wasProtected: false,
                        });
                        setTimeout(() => {
                          setNightResults(null);
                        }, 5000);
                      } else if (deadPlayers.length === 0 && !nightResults) {
                        // No one died
                        setNightResults({
                          killedPlayerName: null,
                          wasProtected: false,
                        });
                        setTimeout(() => {
                          setNightResults(null);
                        }, 5000);
                      }
                      
                      setPlayers(playerRows as Player[]);
                      const userId = getUserId();
                      const currentPlayerData = playerRows.find((p: any) => p.user_id === userId);
                      if (currentPlayerData) {
                        setCurrentPlayer(currentPlayerData as Player);
                      }
                    }
                  }
                };
                reload();
              }
            }, 500);
          }
        },
      )
      .subscribe();

    // Subscribe to player changes (INSERT, UPDATE for roles)
    const playersChannel = supabase
      .channel(`players-game-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
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
                  role: newPlayer.role,
                  user_id: newPlayer.user_id,
                },
              ];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedPlayer = payload.new as any;
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === updatedPlayer.id
                  ? {
                      ...p,
                      name: updatedPlayer.name,
                      alive: updatedPlayer.alive,
                      role: updatedPlayer.role,
                      user_id: updatedPlayer.user_id,
                    }
                  : p
              )
            );
            // Update current player if it's them
            if (updatedPlayer.user_id === currentUserId) {
              setCurrentPlayer(updatedPlayer as Player);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gameChannel);
      supabase.removeChannel(playersChannel);
    };
  }, [game?.id, currentUserId]);

  const handleStartGame = async () => {
    if (!game || !currentUserId) return;
    
    setStartingGame(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start game');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to start game');
    } finally {
      setStartingGame(false);
    }
  };

  const checkNightStatus = async () => {
    if (!code || !game) return;
    const currentGameState = game.game_state || game.phase || 'lobby';
    if (currentGameState !== 'night') return;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:checkNightStatus:entry',message:'checkNightStatus called',data:{hasGame:!!game,hasCode:!!code,currentUserId,gameHostId:game?.host_id},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    try {
      const res = await fetch(`/api/games/${code}/night/status`);
      const data = await res.json();

      if (res.ok && data) {
        setNightStatus({
          allComplete: data.allComplete,
          completedCount: data.completedCount,
          totalAlivePlayers: data.totalAlivePlayers,
        });

        // Compute isHost locally to avoid temporal dead zone issue
        const isHost = game.host_id === currentUserId;

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:checkNightStatus:before-autocomplete',message:'Checking if should auto-complete',data:{allComplete:data.allComplete,isHost,currentGameState},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // If all actions are complete and we're the host, auto-complete night
        if (data.allComplete && isHost && currentGameState === 'night') {
          handleCompleteNight();
        }
      }
    } catch (e: any) {
      console.error('Error checking night status:', e);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:checkNightStatus:error',message:'Error in checkNightStatus',data:{error:e?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
  };

  const handleSubmitNightAction = async () => {
    if (!currentPlayer || !code || submittingAction) return;

    const role = currentPlayer.role;
    if (!role) return;

    // Villagers don't need a target
    if (role === 'villager') {
      // Submit action without target
    } else if (!selectedTargetId) {
      setError('Please select a target first');
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${code}/night/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          targetPlayerId: selectedTargetId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit action');
      }

      setActionSubmitted(true);

      // If seer, show the result
      if (role === 'seer' && data.seerResult && selectedTargetId) {
        const targetPlayer = players.find((p) => p.id === selectedTargetId);
        if (targetPlayer) {
          setSeerResult({
            targetName: targetPlayer.name,
            isWerewolf: data.seerResult.isWerewolf,
          });
        }
      }

      // Check night status after submitting
      setTimeout(() => {
        checkNightStatus();
      }, 500);
    } catch (e: any) {
      setError(e.message || 'Failed to submit action');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCompleteNight = async () => {
    if (!code || !currentUserId || !game) return;
    const currentGameState = game.game_state || game.phase || 'lobby';
    if (currentGameState !== 'night') return;

    try {
      const res = await fetch(`/api/games/${code}/night/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If not all actions complete, that's okay - we'll auto-complete later
        if (data.error?.includes('Not all players')) {
          return;
        }
        throw new Error(data.error || 'Failed to complete night');
      }

      // Store results for display
      if (data.results) {
        setNightResults({
          killedPlayerName: data.results.killedPlayerName || null,
          wasProtected: data.results.wasProtected || false,
        });

        // Clear results after 5 seconds
        setTimeout(() => {
          setNightResults(null);
        }, 5000);
      }

      // Reset night action state
      setActionSubmitted(false);
      setSelectedTargetId(null);
      setSeerResult(null);
      setNightStatus(null);
    } catch (e: any) {
      console.error('Error completing night:', e);
      // Don't show error if it's just that not all actions are complete yet
      if (!e.message?.includes('Not all players')) {
        setError(e.message || 'Failed to complete night');
      }
    }
  };

  // Poll for night status when in night phase
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/479a9dd2-8a0d-46ff-bb39-693caa23b71b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:useEffect:entry',message:'Night status polling useEffect',data:{hasGame:!!game,gameState:game?.game_state,gamePhase:game?.phase,currentPlayerAlive:currentPlayer?.alive,hasCode:!!code},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!game) return;
    const currentGameState = game.game_state || game.phase || 'lobby';
    if (currentGameState === 'night' && currentPlayer?.alive) {
      checkNightStatus();
      const interval = setInterval(() => {
        checkNightStatus();
      }, 2000); // Check every 2 seconds

      return () => clearInterval(interval);
    }
  }, [game?.game_state, game?.phase, currentPlayer?.alive, code, game?.host_id, currentUserId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <p>Loading game...</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-red-200 text-sm">{error || 'Game not found'}</p>
      </main>
    );
  }

  const gameState = game.game_state || game.phase || 'lobby';
  const isHost = game.host_id === currentUserId;
  const isLobby = gameState === 'lobby';
  const hasMinimumPlayers = players.length >= 4;
  const werewolfTeammates = players.filter(
    (p) => p.role === 'werewolf' && p.user_id !== currentUserId && p.alive
  );

  const getRoleDisplayName = (role?: string): string => {
    if (!role) return '';
    const roleMap: Record<string, string> = {
      werewolf: 'Werewolf',
      villager: 'Villager',
      seer: 'Seer',
      doctor: 'Doctor',
    };
    return roleMap[role] || role;
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="mb-2 text-2xl font-semibold text-center">Game {game.code}</h1>
        <p className="mb-4 text-center text-sm text-slate-400">
          Phase:{' '}
          <span className="font-semibold text-indigo-300 capitalize">
            {gameState}
          </span>
        </p>

        {/* Role Display (only after game starts) */}
        {!isLobby && currentPlayer?.role && (
          <div className="mb-4 rounded-md border border-indigo-800 bg-indigo-950/40 px-4 py-3">
            <p className="text-xs text-indigo-300 mb-1">Your Role</p>
            <p className="text-lg font-semibold text-indigo-200">
              {getRoleDisplayName(currentPlayer.role)}
            </p>
            {currentPlayer.role === 'werewolf' && werewolfTeammates.length > 0 && (
              <p className="mt-2 text-xs text-red-300">
                Your teammates: {werewolfTeammates.map((p) => p.name).join(', ')}
              </p>
            )}
            {currentPlayer.role === 'werewolf' && werewolfTeammates.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">
                You are the only werewolf alive.
              </p>
            )}
          </div>
        )}

        {/* Night Phase UI */}
        {gameState === 'night' && currentPlayer?.alive && (
          <div className="mb-4 rounded-md border border-purple-800 bg-purple-950/40 px-4 py-3">
            <p className="text-xs text-purple-300 mb-3 font-semibold">Night Phase - Choose Your Action</p>
            
            {/* Seer UI */}
            {currentPlayer.role === 'seer' && (
              <div>
                {!actionSubmitted ? (
                  <>
                    <p className="text-sm text-purple-200 mb-2">Select a player to see their identity:</p>
                    <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                      {players
                        .filter((p) => p.alive && p.id !== currentPlayer.id)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedTargetId(p.id)}
                            className={`w-full text-left px-3 py-2 rounded text-sm ${
                              selectedTargetId === p.id
                                ? 'bg-purple-700 border border-purple-500'
                                : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                    <button
                      onClick={handleSubmitNightAction}
                      disabled={!selectedTargetId || submittingAction}
                      className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-medium hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submittingAction ? 'Viewing...' : 'View Identity'}
                    </button>
                  </>
                ) : seerResult ? (
                  <div className="bg-slate-800 rounded p-3 border border-slate-700">
                    <p className="text-sm text-purple-200 mb-1">You see that:</p>
                    <p className="text-base font-semibold text-purple-100">
                      {seerResult.targetName} is {seerResult.isWerewolf ? 'a Werewolf' : 'a Villager'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-purple-200">Action submitted. Waiting for other players...</p>
                )}
              </div>
            )}

            {/* Werewolf UI */}
            {currentPlayer.role === 'werewolf' && (
              <div>
                {!actionSubmitted ? (
                  <>
                    <p className="text-sm text-purple-200 mb-2">Select a player to kill (cannot be a werewolf):</p>
                    <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                      {players
                        .filter((p) => p.alive && p.id !== currentPlayer.id && p.role !== 'werewolf')
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedTargetId(p.id)}
                            className={`w-full text-left px-3 py-2 rounded text-sm ${
                              selectedTargetId === p.id
                                ? 'bg-red-700 border border-red-500'
                                : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                    <button
                      onClick={handleSubmitNightAction}
                      disabled={!selectedTargetId || submittingAction}
                      className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submittingAction ? 'Selecting...' : 'Select Kill Target'}
                    </button>
                    {werewolfTeammates.length > 0 && (
                      <p className="mt-2 text-xs text-red-300">
                        Note: If multiple wolves vote differently, the last vote wins.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-purple-200">Kill target selected. Waiting for other players...</p>
                )}
              </div>
            )}

            {/* Doctor UI */}
            {currentPlayer.role === 'doctor' && (
              <div>
                {!actionSubmitted ? (
                  <>
                    <p className="text-sm text-purple-200 mb-2">Select a player to protect:</p>
                    <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                      {players
                        .filter((p) => p.alive)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedTargetId(p.id)}
                            className={`w-full text-left px-3 py-2 rounded text-sm ${
                              selectedTargetId === p.id
                                ? 'bg-emerald-700 border border-emerald-500'
                                : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                    <button
                      onClick={handleSubmitNightAction}
                      disabled={!selectedTargetId || submittingAction}
                      className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submittingAction ? 'Protecting...' : 'Protect Player'}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-purple-200">Protection target selected. Waiting for other players...</p>
                )}
              </div>
            )}

            {/* Villager UI */}
            {currentPlayer.role === 'villager' && (
              <div>
                {!actionSubmitted ? (
                  <button
                    onClick={handleSubmitNightAction}
                    disabled={submittingAction}
                    className="w-full rounded-md bg-slate-600 px-3 py-2 text-sm font-medium hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submittingAction ? 'Submitting...' : "I'm Ready"}
                  </button>
                ) : (
                  <p className="text-sm text-purple-200">Ready. Waiting for other players...</p>
                )}
              </div>
            )}

            {/* Night Status */}
            {nightStatus && (
              <div className="mt-3 pt-3 border-t border-purple-800">
                <p className="text-xs text-purple-300">
                  {nightStatus.completedCount} / {nightStatus.totalAlivePlayers} players completed
                  {nightStatus.allComplete && (
                    <span className="text-emerald-400 ml-2">✓ All actions complete</span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Night Results Notification */}
        {nightResults && (
          <div className="mb-4 rounded-md border border-amber-800 bg-amber-950/40 px-4 py-3">
            <p className="text-xs text-amber-300 mb-1 font-semibold">Night Results</p>
            {nightResults.killedPlayerName ? (
              <p className="text-sm text-amber-200">
                {nightResults.killedPlayerName} was killed{nightResults.wasProtected ? ' but was saved!' : '.'}
              </p>
            ) : (
              <p className="text-sm text-amber-200">No one was killed tonight.</p>
            )}
          </div>
        )}

        {/* Facilitator Controls (only in lobby, only for host) */}
        {isLobby && isHost && (
          <div className="mb-4 rounded-md border border-amber-800 bg-amber-950/40 px-4 py-3">
            <p className="text-xs text-amber-300 mb-2">Facilitator Controls</p>
            <button
              onClick={handleStartGame}
              disabled={!hasMinimumPlayers || startingGame}
              className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {startingGame
                ? 'Starting...'
                : hasMinimumPlayers
                  ? `Start Game (${players.length} players)`
                  : `Need ${4 - players.length} more players to start`}
            </button>
            {hasMinimumPlayers && (
              <p className="mt-2 text-xs text-amber-200">
                Role distribution: {players.length === 4
                  ? '1 Werewolf, 1 Seer, 2 Villagers'
                  : players.length <= 7
                    ? '2 Werewolves, 1 Seer, ' + (players.length - 3) + ' Villagers'
                    : players.length <= 10
                      ? '2 Werewolves, 1 Seer, 1 Doctor, ' + (players.length - 4) + ' Villagers'
                      : '3 Werewolves, 1 Seer, 1 Doctor, ' + (players.length - 5) + ' Villagers'}
              </p>
            )}
          </div>
        )}

        <h2 className="mb-2 text-sm font-semibold">Players ({players.length})</h2>
        <ul className="space-y-1 text-sm">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span>{p.name}</span>
                {p.user_id === currentUserId && (
                  <span className="text-xs text-slate-400">(You)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={p.alive ? 'text-emerald-400 text-xs' : 'text-slate-500 text-xs'}>
                  {p.alive ? 'Alive' : 'Dead'}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {isLobby && (
          <p className="mt-4 text-[11px] text-slate-500">
            Waiting for players to join. Minimum 4 players required to start.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

