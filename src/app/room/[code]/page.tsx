'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { getAudio, PhaseKey } from '@/lib/audio';
import CountdownTimer from '@/components/CountdownTimer';
import PlayerList from '@/components/PlayerList';
import PromptEditor from '@/components/PromptEditor';
import ResultsReveal from '@/components/ResultsReveal';
import Leaderboard from '@/components/Leaderboard';
import {
  GameState,
  Player,
  ReferenceImage,
  PlayerResult,
  LeaderboardEntry,
  GamePhase,
  PowerupId,
  POWERUP_DEFS,
} from '@/hooks/useGameSocket';

// ── Types ──────────────────────────────────────────────────────────────
interface LocalState extends GameState {
  roomCode: string;
}

const INITIAL: GameState = {
  phase: 'lobby' as GamePhase,
  roomCode: null,
  myPlayerId: null,
  players: [],
  currentRound: 0,
  totalRounds: 1,
  referenceImage: null,
  tokenBudget: 120,
  roundDurationMs: 90000,
  timeRemaining: 90,
  countdownValue: 3,
  submittedThisRound: false,
  waitingForPlayers: 0,
  results: [],
  leaderboard: [],
  error: null,
  isConnected: false,
  myPowerup: null,
  powerupUsed: false,
  isFrozen: false,
  frozenSecondsLeft: 0,
  hasShield: false,
  hasDoublePoints: false,
  hintKeywords: [],
  revealedCategory: null,
  powerupNotification: null,
  tokenDrainAmount: 0,
};

export default function GameRoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string ?? '').toUpperCase();

  const socketRef = useRef<Socket | null>(null);
  const [gs, setGs] = useState<GameState>(INITIAL);
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [powerupTarget, setPowerupTarget] = useState<string | null>(null);
  const [muted, setMuted] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('promptinary_muted') === 'true' : false
  );
  const freezeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Background music ──────────────────────────────────────────────────
  // Randomize lobby+playing tracks once per room visit
  useEffect(() => {
    getAudio().randomize();
    return () => getAudio().stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch to the right track whenever the game phase changes
  useEffect(() => {
    const phaseMap: Record<string, PhaseKey> = {
      lobby:       'lobby',
      countdown:   'countdown',
      playing:     'playing',
      scoring:     'scoring',
      reveal:      'reveal',
      leaderboard: 'leaderboard',
    };
    const track = phaseMap[gs.phase];
    if (track) getAudio().play(track);
  }, [gs.phase]);

  const update = useCallback((patch: Partial<GameState>) => {
    setGs(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Socket lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    const playerName = localStorage.getItem('promptinary_name') || 'Anonymous';
    // Reuse the singleton socket — prevents double-joining when navigating
    // from the landing page which already emitted create-room/join-room.
    const socket: Socket = getSocket();
    socketRef.current = socket;

    // #region agent log
    fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:useEffect-mount',message:'effect mount',data:{code,socketId:socket.id,connected:socket.connected,active:(socket as unknown as {active:boolean}).active},timestamp:Date.now(),hypothesisId:'H-B,H-E'})}).catch(()=>{});
    // #endregion

    const joinRoom = () => {
      // #region agent log
      fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:joinRoom',message:'emitting join-room',data:{code,socketId:socket.id,connected:socket.connected},timestamp:Date.now(),hypothesisId:'H-A,H-C'})}).catch(()=>{});
      // #endregion
      update({ isConnected: true, myPlayerId: socket.id ?? null });
      // Always emit join-room. The server handles this idempotently:
      // if the socket is already a player in the room it simply resyncs state.
      socket.emit('join-room', { roomCode: code, playerName });
    };

    // #region agent log
    socket.on('connect', () => { fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:on-connect',message:'socket connect/reconnect fired',data:{socketId:socket.id,code},timestamp:Date.now(),hypothesisId:'H-I5'})}).catch(()=>{}); });
    // #endregion

    if (socket.connected) {
      joinRoom();
    } else {
      socket.once('connect', joinRoom);
    }

    // ── Named handlers — stored so cleanup can remove exactly these, without
    // touching socket.io's own internal event machinery (heartbeat etc.)
    const onDisconnect = (reason: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:on-disconnect',message:'client socket disconnected',data:{reason,socketId:socket.id,code},timestamp:Date.now(),hypothesisId:'H-I5'})}).catch(()=>{});
      // #endregion
      update({ isConnected: false });
    };

    const onRoomCreated = (data: { code?: string; roomCode?: string; state?: { players?: Player[] }; player?: Player }) => {
      const rc = data.code ?? data.roomCode ?? code;
      const players = data.state?.players ?? (data.player ? [data.player] : []);
      update({ phase: 'lobby', roomCode: rc, players, error: null });
    };

    const onRoomJoined = (data: { code?: string; roomCode?: string; state?: { players?: Player[] }; player?: Player; room?: { players: Player[] | Record<string, Player> } }) => {
      // #region agent log
      fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:room-joined',message:'room-joined received',data:{code:data.code,playerCount:data.state?.players?.length,socketId:socket.id},timestamp:Date.now(),hypothesisId:'H-F'})}).catch(()=>{});
      // #endregion
      const rc = data.code ?? data.roomCode ?? code;
      let players: Player[] = [];
      if (data.state?.players) players = data.state.players;
      else if (data.room?.players) players = Array.isArray(data.room.players) ? data.room.players : Object.values(data.room.players);
      else if (data.player) players = [data.player];
      update({ phase: 'lobby', roomCode: rc, players, error: null });
    };

    const onGameStart = (data: { countdown?: number; round?: number; totalRounds?: number; image?: ReferenceImage; tokenBudget?: number; duration?: number }) => {
      update({
        phase: 'countdown',
        countdownValue: data.countdown ?? 3,
        error: null,
        ...(data.round !== undefined && { currentRound: data.round }),
        ...(data.totalRounds !== undefined && { totalRounds: data.totalRounds }),
        ...(data.image !== undefined && { referenceImage: data.image }),
        ...(data.tokenBudget !== undefined && { tokenBudget: data.tokenBudget }),
        ...(data.duration !== undefined && { roundDurationMs: data.duration, timeRemaining: Math.ceil(data.duration / 1000) }),
        powerupUsed: false, isFrozen: false, frozenSecondsLeft: 0,
        hasShield: false, hasDoublePoints: false, hintKeywords: [],
        revealedCategory: null, powerupNotification: null, tokenDrainAmount: 0,
        submittedThisRound: false, results: [],
      });
    };

    const onCountdownTick = (data: { value: number }) => update({ countdownValue: data.value });

    const onRoundPlaying = (_data: { startTime?: number }) => {
      setGeneratedImage(null); setGenError(null); setGenerating(false);
      update({ phase: 'playing' });
    };

    const onTimerTick = (data: { timeRemaining?: number; timeLeft?: number }) =>
      update({ timeRemaining: data.timeRemaining ?? data.timeLeft ?? 0 });

    const onPlayerSubmitted = (data: { playerId: string; waitingFor: number }) =>
      update({ waitingForPlayers: data.waitingFor });

    const onRoomUpdate = (data: { code?: string; players: Player[] | Record<string, Player>; phase?: string; powerups?: Record<string, PowerupId> }) => {
      const players = Array.isArray(data.players) ? data.players : Object.values(data.players);
      const myId = socket.id ?? '';
      const myPowerup = myId && data.powerups ? (data.powerups[myId] ?? null) : null;
      const patch: Partial<GameState> = { players, myPowerup: myPowerup as PowerupId | null };
      if (data.code) patch.roomCode = data.code;
      update(patch);
    };

    const onPowerupReceived = (data: { powerupId: PowerupId; casterId: string; casterName: string; amount?: number; duration?: number }) => {
      if (data.powerupId === 'TOKEN_DRAIN') {
        update({ tokenDrainAmount: data.amount ?? 20, powerupNotification: { message: `⚡ ${data.casterName} drained 20 tokens from you!`, type: 'attack' } });
        setTimeout(() => update({ powerupNotification: null }), 4000);
      } else if (data.powerupId === 'FREEZE') {
        if (freezeIntervalRef.current) clearInterval(freezeIntervalRef.current);
        let secs = data.duration ?? 10;
        update({ isFrozen: true, frozenSecondsLeft: secs, powerupNotification: { message: `❄️ ${data.casterName} froze your timer for ${secs}s!`, type: 'attack' } });
        freezeIntervalRef.current = setInterval(() => {
          secs--;
          if (secs <= 0) { clearInterval(freezeIntervalRef.current!); freezeIntervalRef.current = null; update({ isFrozen: false, frozenSecondsLeft: 0, powerupNotification: null }); }
          else update({ frozenSecondsLeft: secs });
        }, 1000);
      }
    };

    const onPowerupSelf = (data: { powerupId: PowerupId; hints?: string[]; category?: string; difficulty?: string }) => {
      if (data.powerupId === 'TOKEN_SHIELD') { update({ hasShield: true, powerupNotification: { message: '🛡️ Shield activated! You are protected from the next attack.', type: 'defend' } }); setTimeout(() => update({ powerupNotification: null }), 4000); }
      else if (data.powerupId === 'HINT') { update({ hintKeywords: data.hints ?? [], powerupNotification: { message: `💡 Hint revealed: ${(data.hints ?? []).join(', ')}`, type: 'info' } }); setTimeout(() => update({ powerupNotification: null }), 6000); }
      else if (data.powerupId === 'DOUBLE_POINTS') { update({ hasDoublePoints: true, powerupNotification: { message: '⭐ Double Points active! Your score will be doubled.', type: 'info' } }); setTimeout(() => update({ powerupNotification: null }), 4000); }
      else if (data.powerupId === 'CATEGORY') { update({ revealedCategory: `${data.category} · ${data.difficulty}`, powerupNotification: { message: `🏷️ Category revealed: ${data.category} (${data.difficulty})`, type: 'info' } }); setTimeout(() => update({ powerupNotification: null }), 6000); }
    };

    const onPowerupBlocked = (data: { casterId: string; casterName: string; targetId: string; targetName?: string; powerupId: PowerupId }) => {
      if (data.targetId === socket.id) {
        update({ hasShield: false, powerupNotification: { message: `🛡️ Your shield blocked ${data.casterName}'s ${data.powerupId.replace('_', ' ')}!`, type: 'defend' } });
        setTimeout(() => update({ powerupNotification: null }), 4000);
      }
    };

    const onScoringStarted = () => update({ phase: 'scoring' });

    const onResultsReady = (data: { results: PlayerResult[] }) =>
      update({ phase: 'reveal', results: data.results });

    const onGameOver = (data: { leaderboard: LeaderboardEntry[] }) =>
      update({ phase: 'leaderboard', leaderboard: data.leaderboard });

    const onPlayerLeft = (data: { players: Player[] | Record<string, Player> }) => {
      const players = Array.isArray(data.players) ? data.players : Object.values(data.players);
      update({ players });
    };

    const onError = (data: { message: string }) => {
      // #region agent log
      fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:error',message:'error received from server',data:{error:data.message,socketId:socket.id},timestamp:Date.now(),hypothesisId:'H-F'})}).catch(()=>{});
      // #endregion
      update({ error: data.message });
    };

    socket.on('disconnect', onDisconnect);
    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('game-start', onGameStart);
    socket.on('countdown-tick', onCountdownTick);
    socket.on('round-playing', onRoundPlaying);
    socket.on('timer-tick', onTimerTick);
    socket.on('player-submitted', onPlayerSubmitted);
    socket.on('room-update', onRoomUpdate);
    socket.on('powerup-received', onPowerupReceived);
    socket.on('powerup-self', onPowerupSelf);
    socket.on('powerup-used', () => { /* no-op */ });
    socket.on('powerup-blocked', onPowerupBlocked);
    socket.on('scoring-started', onScoringStarted);
    socket.on('results-ready', onResultsReady);
    socket.on('game-over', onGameOver);
    socket.on('player-left', onPlayerLeft);
    socket.on('error', onError);

    return () => {
      // #region agent log
      fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:cleanup',message:'effect cleanup — removing named listeners only',data:{socketId:socket.id,connected:socket.connected},timestamp:Date.now(),hypothesisId:'H-I5'})}).catch(()=>{});
      // #endregion
      // Remove only the handlers WE registered — never call removeAllListeners()
      // as that strips socket.io's internal heartbeat machinery and causes the
      // server to drop the connection after ~20s (ping timeout).
      socket.off('disconnect', onDisconnect);
      socket.off('room-created', onRoomCreated);
      socket.off('room-joined', onRoomJoined);
      socket.off('game-start', onGameStart);
      socket.off('countdown-tick', onCountdownTick);
      socket.off('round-playing', onRoundPlaying);
      socket.off('timer-tick', onTimerTick);
      socket.off('player-submitted', onPlayerSubmitted);
      socket.off('room-update', onRoomUpdate);
      socket.off('powerup-received', onPowerupReceived);
      socket.off('powerup-self', onPowerupSelf);
      socket.off('powerup-blocked', onPowerupBlocked);
      socket.off('scoring-started', onScoringStarted);
      socket.off('results-ready', onResultsReady);
      socket.off('game-over', onGameOver);
      socket.off('player-left', onPlayerLeft);
      socket.off('error', onError);
      if (freezeIntervalRef.current) clearInterval(freezeIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Actions ───────────────────────────────────────────────────────────
  const roomCode = gs.roomCode ?? code;

  const setReady = (_isReady: boolean) => {
    // #region agent log
    fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:setReady',message:'emitting player-ready',data:{roomCode,socketId:socketRef.current?.id},timestamp:Date.now(),hypothesisId:'H-G'})}).catch(()=>{});
    // #endregion
    socketRef.current?.emit('player-ready', { roomCode });
  };

  const startGame = () => {
    socketRef.current?.emit('start-game', { roomCode });
  };

  const nextRound = () => {
    socketRef.current?.emit('next-round', { roomCode });
  };

  const playAgain = () => {
    socketRef.current?.emit('play-again', { roomCode });
    update({
      phase: 'lobby',
      currentRound: 0,
      results: [],
      leaderboard: [],
      submittedThisRound: false,
    });
  };

  // Generate image then submit
  const handlePromptSubmit = async (prompt: string, tokensUsed: number) => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!data.success || !data.imageData) {
        throw new Error(data.error || 'Image generation failed');
      }
      setGeneratedImage(data.imageData);
      // #region agent log
      fetch('http://127.0.0.1:7618/ingest/f092a34c-acae-4a79-89ca-333569c38371',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5dffed'},body:JSON.stringify({sessionId:'5dffed',location:'room/page.tsx:submit-prompt-emit',message:'emitting submit-prompt',data:{roomCode,imageSizeBytes:data.imageData?.length,socketId:socketRef.current?.id,socketConnected:socketRef.current?.connected},timestamp:Date.now(),hypothesisId:'H-I5-size'})}).catch(()=>{});
      // #endregion
      socketRef.current?.emit('submit-prompt', {
        roomCode,
        prompt,
        imageData: data.imageData,
        tokensUsed,
      });
      update({ submittedThisRound: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate image';
      setGenError(message);
      // Submit without image so the player isn't stuck
      socketRef.current?.emit('submit-prompt', {
        roomCode,
        prompt,
        imageData: null,
        tokensUsed,
      });
      update({ submittedThisRound: true });
    } finally {
      setGenerating(false);
    }
  };

  const usePowerup = (powerupId: PowerupId, targetPlayerId?: string) => {
    socketRef.current?.emit('use-powerup', { roomCode: code, powerupId, targetPlayerId });
    update({ myPowerup: null, powerupUsed: true });
    setPowerupTarget(null);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const myPlayer = gs.players.find(p => p.id === gs.myPlayerId);
  const isHost = myPlayer?.isHost ?? false;
  const allReady = gs.players.length >= 1 && gs.players.every(p => p.isReady);

  // ── Render phases ─────────────────────────────────────────────────────
  return (
    <div className="page-wrapper">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="page-content" style={{ paddingTop: 24, paddingBottom: 40 }}>
        {/* Room code header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--black)',
              opacity: 0.6,
              padding: '4px 0',
            }}
          >
            ← Home
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mute / unmute background music */}
            <button
              onClick={() => {
                const nowMuted = getAudio().toggleMute();
                setMuted(nowMuted);
              }}
              title={muted ? 'Unmute music' : 'Mute music'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                background: muted ? 'var(--track)' : 'var(--white)',
                border: 'var(--border)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                fontSize: 16,
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 120ms ease',
                flexShrink: 0,
              }}
            >
              {muted ? '🔇' : '🎵'}
            </button>

            <button
              onClick={copyRoomCode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'var(--black)',
                color: 'var(--white)',
                border: 'var(--border)',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                letterSpacing: '0.08em',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 120ms ease',
              }}
            >
              {copied ? '✓ Copied!' : `# ${code}`}
            </button>
          </div>
        </div>

        {/* Global error banner */}
        {gs.error && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--coral)',
            border: 'var(--border)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 13,
            color: 'var(--white)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{gs.error}</span>
            <button
              onClick={() => update({ error: null })}
              style={{ background: 'none', border: 'none', color: 'var(--white)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
            >
              ×
            </button>
          </div>
        )}

        {/* Phase: LOBBY */}
        {gs.phase === 'lobby' && (
          <LobbyView
            gs={gs}
            isHost={isHost}
            allReady={allReady}
            onToggleReady={setReady}
            onStartGame={startGame}
            onCopyCode={copyRoomCode}
          />
        )}

        {/* Phase: COUNTDOWN */}
        {gs.phase === 'countdown' && (
          <CountdownView value={gs.countdownValue} />
        )}

        {/* Phase: PLAYING */}
        {gs.phase === 'playing' && (
          <PlayingView
            gs={gs}
            generating={generating}
            generatedImage={generatedImage}
            genError={genError}
            onSubmit={handlePromptSubmit}
            onUsePowerup={usePowerup}
            powerupTarget={powerupTarget}
            onSetPowerupTarget={setPowerupTarget}
          />
        )}

        {/* Phase: SCORING */}
        {gs.phase === 'scoring' && (
          <ScoringView />
        )}

        {/* Phase: REVEAL */}
        {gs.phase === 'reveal' && (
          <div>
            <ResultsReveal
              results={gs.results}
              referenceImage={gs.referenceImage}
              myPlayerId={gs.myPlayerId}
            />
            {isHost && (
              <div style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={nextRound}>
                  {gs.currentRound >= gs.totalRounds ? 'See Final Scores ▶' : 'Next Round ▶'}
                </button>
              </div>
            )}
            {!isHost && (
              <div style={{ marginTop: 20, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.6 }}>
                Waiting for host to continue...
              </div>
            )}
          </div>
        )}

        {/* Phase: LEADERBOARD */}
        {gs.phase === 'leaderboard' && (
          <Leaderboard
            entries={gs.leaderboard}
            myPlayerId={gs.myPlayerId}
            currentRound={gs.currentRound}
            totalRounds={gs.totalRounds}
            isHost={isHost}
            onNextRound={nextRound}
            onPlayAgain={playAgain}
            isGameOver={gs.currentRound >= gs.totalRounds}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-views ─────────────────────────────────────────────────────────

function LobbyView({
  gs,
  isHost,
  allReady,
  onToggleReady,
  onStartGame,
}: {
  gs: GameState;
  isHost: boolean;
  allReady: boolean;
  onToggleReady: (ready: boolean) => void;
  onStartGame: () => void;
  onCopyCode: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="animate-slide-up">
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 28,
          marginBottom: 6,
        }}>
          Lobby
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.6 }}>
          Share the room code to invite friends
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatCard label="Players" value={`${gs.players.length} / 8`} color="var(--sky)" />
        <StatCard label="Rounds" value={`${gs.totalRounds}`} color="var(--gold)" />
      </div>

      {/* Stripe divider */}
      <div className="stripe-divider" />

      {/* Player list */}
      <PlayerList
        players={gs.players}
        myPlayerId={gs.myPlayerId}
        onToggleReady={onToggleReady}
        canStart={allReady && gs.players.length >= 1}
        onStartGame={onStartGame}
        isHost={isHost}
      />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: color,
      border: 'var(--border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>
        {value}
      </div>
    </div>
  );
}

function CountdownView({ value }: { value: number }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 16,
    }}>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 16, opacity: 0.7 }}>
        Get ready!
      </p>
      <div
        key={value}
        className="animate-bounce-in"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 120,
          lineHeight: 1,
          color: value <= 1 ? 'var(--coral)' : value <= 2 ? 'var(--orange)' : 'var(--teal)',
        }}
      >
        {value}
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.5 }}>
        Round starting...
      </p>
    </div>
  );
}

function PlayingView({
  gs,
  generating,
  generatedImage,
  genError,
  onSubmit,
  onUsePowerup,
  powerupTarget,
  onSetPowerupTarget,
}: {
  gs: GameState;
  generating: boolean;
  generatedImage: string | null;
  genError: string | null;
  onSubmit: (prompt: string, tokensUsed: number) => void;
  onUsePowerup: (powerupId: PowerupId, targetPlayerId?: string) => void;
  powerupTarget: string | null;
  onSetPowerupTarget: (id: string | null) => void;
}) {
  const totalSeconds = Math.ceil(gs.roundDurationMs / 1000);
  const effectiveBudget = Math.max(0, gs.tokenBudget - gs.tokenDrainAmount);
  const def = gs.myPowerup ? POWERUP_DEFS[gs.myPowerup] : null;
  const needsTarget = def?.requiresTarget ?? false;
  const opponents = gs.players.filter(p => p.id !== gs.myPlayerId);

  const handlePowerupActivate = () => {
    if (!gs.myPowerup) return;
    if (needsTarget) {
      // Toggle target selection mode
      onSetPowerupTarget(powerupTarget ? null : 'selecting');
    } else {
      onUsePowerup(gs.myPowerup);
    }
  };

  const handleTargetSelect = (targetId: string) => {
    if (!gs.myPowerup) return;
    onUsePowerup(gs.myPowerup, targetId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Powerup notification banner */}
      {gs.powerupNotification && (
        <div style={{
          padding: '10px 14px',
          background: gs.powerupNotification.type === 'attack' ? 'var(--coral)' : gs.powerupNotification.type === 'defend' ? 'var(--teal)' : 'var(--gold)',
          border: 'var(--border)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
          fontSize: 13,
          color: gs.powerupNotification.type === 'attack' ? 'var(--white)' : 'var(--black)',
          animation: 'animate-slide-up 0.3s ease',
        }}>
          {gs.powerupNotification.message}
        </div>
      )}

      {/* Freeze overlay */}
      {gs.isFrozen && (
        <div style={{
          padding: '12px 16px',
          background: '#dbeafe',
          border: '2px solid #3b82f6',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 15,
          color: '#1d4ed8',
          textAlign: 'center',
        }}>
          ❄️ Timer frozen! {gs.frozenSecondsLeft}s remaining
        </div>
      )}

      {/* Round info + timer row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Round
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28 }}>
            {gs.currentRound} / {gs.totalRounds}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <CountdownTimer timeRemaining={gs.isFrozen ? gs.timeRemaining : gs.timeRemaining} totalSeconds={totalSeconds} />
          {gs.hasDoublePoints && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 99, border: '1px solid #f59e0b' }}>
              ⭐ 2× Points
            </span>
          )}
          {gs.hasShield && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#ccfbf1', padding: '2px 8px', borderRadius: 99, border: '1px solid #14b8a6' }}>
              🛡️ Shielded
            </span>
          )}
        </div>
      </div>

      {/* Progress bar for timer */}
      <div className="progress-track">
        <div
          className={`progress-fill ${gs.timeRemaining <= 10 ? 'danger' : gs.timeRemaining <= 30 ? 'warning' : 'safe'}`}
          style={{ width: `${(gs.timeRemaining / totalSeconds) * 100}%`, opacity: gs.isFrozen ? 0.4 : 1 }}
        />
      </div>

      {/* Reference image */}
      {gs.referenceImage && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>
              Target Image
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className={`badge badge-${gs.referenceImage.difficulty.toLowerCase()}`}>
                {gs.revealedCategory ? gs.referenceImage.difficulty : gs.referenceImage.difficulty}
              </span>
              <span className="badge badge-category">
                {gs.revealedCategory ? gs.referenceImage.category : gs.referenceImage.category}
              </span>
            </div>
          </div>
          <div style={{
            border: 'var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gs.referenceImage.url}
              alt={gs.referenceImage.title}
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div style={{
            marginTop: 6,
            textAlign: 'center',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            opacity: 0.7,
          }}>
            {gs.referenceImage.title}
          </div>
        </div>
      )}

      {/* Hint keywords */}
      {gs.hintKeywords.length > 0 && (
        <div style={{
          padding: '10px 14px',
          background: '#fefce8',
          border: '1.5px solid #fbbf24',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, opacity: 0.7 }}>💡 Keywords:</span>
          {gs.hintKeywords.map(kw => (
            <span key={kw} style={{
              padding: '3px 10px',
              background: '#fef08a',
              border: '1px solid #fbbf24',
              borderRadius: 99,
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 12,
            }}>{kw}</span>
          ))}
        </div>
      )}

      {/* Powerup tray */}
      {!gs.submittedThisRound && (
        <PowerupTray
          powerup={gs.myPowerup}
          powerupUsed={gs.powerupUsed}
          def={def}
          needsTarget={needsTarget}
          isSelectingTarget={powerupTarget === 'selecting'}
          opponents={opponents}
          onActivate={handlePowerupActivate}
          onTargetSelect={handleTargetSelect}
          onCancelTarget={() => onSetPowerupTarget(null)}
        />
      )}

      {/* Submitted state */}
      {gs.submittedThisRound ? (
        <SubmittedView
          generatedImage={generatedImage}
          waitingFor={gs.waitingForPlayers}
          playerCount={gs.players.length}
        />
      ) : (
        <>
          {/* Prompt editor */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              Write Your Prompt
              {gs.tokenDrainAmount > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--coral)', fontSize: 12 }}>
                  ⚡ Budget reduced by {gs.tokenDrainAmount} tokens
                </span>
              )}
            </div>
            <PromptEditor
              budget={effectiveBudget}
              onSubmit={onSubmit}
              disabled={gs.isFrozen}
              generating={generating}
            />
          </div>

          {gs.isFrozen && (
            <div style={{
              padding: '10px 14px',
              background: '#dbeafe',
              border: 'var(--border)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
              color: '#1d4ed8',
              textAlign: 'center',
            }}>
              ❄️ Your input is frozen for {gs.frozenSecondsLeft} more seconds...
            </div>
          )}

          {genError && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--coral)',
              border: 'var(--border)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--white)',
            }}>
              ⚠️ {genError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Powerup Tray ──────────────────────────────────────────────────────────────

const POWERUP_TYPE_COLORS: Record<string, { bg: string; border: string; label: string; text: string }> = {
  offensive: { bg: '#fee2e2', border: '#f87171', label: '#dc2626', text: '#7f1d1d' },
  defensive: { bg: '#d1fae5', border: '#34d399', label: '#059669', text: '#064e3b' },
  utility:   { bg: '#ede9fe', border: '#a78bfa', label: '#7c3aed', text: '#3b0764' },
};

function PowerupTray({
  powerup,
  powerupUsed,
  def,
  needsTarget,
  isSelectingTarget,
  opponents,
  onActivate,
  onTargetSelect,
  onCancelTarget,
}: {
  powerup: PowerupId | null;
  powerupUsed: boolean;
  def: (typeof POWERUP_DEFS)[PowerupId] | null | undefined;
  needsTarget: boolean;
  isSelectingTarget: boolean;
  opponents: Player[];
  onActivate: () => void;
  onTargetSelect: (id: string) => void;
  onCancelTarget: () => void;
}) {
  if (!powerup && !powerupUsed) return null;

  const colors = def ? POWERUP_TYPE_COLORS[def.type] : POWERUP_TYPE_COLORS.utility;

  return (
    <div style={{
      border: `2px solid ${powerupUsed ? '#d1d5db' : colors.border}`,
      borderRadius: 'var(--radius-lg)',
      background: powerupUsed ? '#f9fafb' : colors.bg,
      padding: '12px 14px',
      transition: 'all 200ms ease',
    }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, marginBottom: 8 }}>
        Your Powerup
      </div>

      {powerupUsed ? (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.5, fontStyle: 'italic' }}>
          Powerup used this round
        </div>
      ) : def ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 28 }}>{def.emoji}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: colors.label,
                  background: 'white',
                  padding: '1px 7px',
                  borderRadius: 99,
                  border: `1px solid ${colors.border}`,
                }}>
                  {def.type}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>{def.name}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, opacity: 0.7, marginTop: 1 }}>{def.description}</div>
            </div>
          </div>

          {/* Target selection */}
          {isSelectingTarget ? (
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>
                Choose a target:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {opponents.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onTargetSelect(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      background: 'white',
                      border: `1.5px solid ${colors.border}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 13,
                      transition: 'background 120ms',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{p.avatar}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
                <button
                  onClick={onCancelTarget}
                  style={{
                    padding: '6px 12px',
                    background: 'none',
                    border: '1.5px solid #d1d5db',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    opacity: 0.6,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onActivate}
              disabled={needsTarget && opponents.length === 0}
              style={{
                width: '100%',
                padding: '9px 16px',
                background: colors.label,
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 13,
                cursor: needsTarget && opponents.length === 0 ? 'not-allowed' : 'pointer',
                opacity: needsTarget && opponents.length === 0 ? 0.5 : 1,
                transition: 'opacity 120ms',
              }}
            >
              {needsTarget ? `Use on opponent →` : `Activate ${def.emoji}`}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}

function SubmittedView({
  generatedImage,
  waitingFor,
  playerCount,
}: {
  generatedImage: string | null;
  waitingFor: number;
  playerCount: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        textAlign: 'center',
        padding: '20px 16px',
        background: 'var(--teal)',
        border: 'var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--white)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
          Submitted!
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, marginTop: 6, opacity: 0.85 }}>
          Waiting for {waitingFor} more player{waitingFor !== 1 ? 's' : ''}...
        </div>
      </div>

      {generatedImage && (
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            Your Generated Image
          </div>
          <div style={{
            border: 'var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generatedImage}
              alt="Your generated image"
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>
      )}

      {/* Scoring animation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        background: 'var(--white)',
        border: 'var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <span style={{
          display: 'inline-block',
          width: 16,
          height: 16,
          border: '2px solid rgba(0,0,0,0.15)',
          borderTopColor: 'var(--teal)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
          flexShrink: 0,
        }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, opacity: 0.7 }}>
          AI is scoring submissions...
        </span>
      </div>
    </div>
  );
}

function ScoringView() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 20,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 52, animation: 'pulse-ring 1.5s ease-in-out infinite' }}>🤖</div>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
      }}>
        Scoring...
      </h2>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        opacity: 0.6,
        maxWidth: 240,
        lineHeight: 1.5,
      }}>
        Gemini AI is analyzing and scoring all submissions
      </p>
      <div style={{
        display: 'flex',
        gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              background: 'var(--teal)',
              borderRadius: '50%',
              animation: `pulse-ring 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
