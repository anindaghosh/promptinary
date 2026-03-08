'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
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
  totalRounds: 3,
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

  const update = useCallback((patch: Partial<GameState>) => {
    setGs(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Socket lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    const playerName = localStorage.getItem('promptinary_name') || 'Anonymous';
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    const socket: Socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      update({ isConnected: true, myPlayerId: socket.id ?? null });
      // Join the room we navigated to
      socket.emit('join-room', { roomCode: code, playerName });
    });

    socket.on('disconnect', () => {
      update({ isConnected: false });
    });

    socket.on('room-created', (data: { roomCode: string; player: Player }) => {
      update({
        phase: 'lobby',
        roomCode: data.roomCode,
        myPlayerId: data.player.id,
        players: [data.player],
        error: null,
      });
    });

    socket.on('room-joined', (data: { roomCode: string; player: Player; room: { players: Player[] | Record<string, Player> } }) => {
      const players = Array.isArray(data.room.players)
        ? data.room.players
        : Object.values(data.room.players);
      update({
        phase: 'lobby',
        roomCode: data.roomCode,
        myPlayerId: data.player.id,
        players,
        error: null,
      });
    });

    socket.on('room-update', (data: { room: { players: Player[] | Record<string, Player>; phase?: string } }) => {
      const players = Array.isArray(data.room.players)
        ? data.room.players
        : Object.values(data.room.players);
      update({ players });
    });

    socket.on('game-start', (data: { countdown: number }) => {
      update({ phase: 'countdown', countdownValue: data.countdown, error: null });
    });

    socket.on('countdown-tick', (data: { value: number }) => {
      update({ countdownValue: data.value });
    });

    socket.on('round-playing', (data: {
      round: number;
      totalRounds: number;
      image: ReferenceImage;
      tokenBudget: number;
      duration: number;
    }) => {
      setGeneratedImage(null);
      setGenError(null);
      setGenerating(false);
      update({
        phase: 'playing',
        currentRound: data.round,
        totalRounds: data.totalRounds,
        referenceImage: data.image,
        tokenBudget: data.tokenBudget,
        roundDurationMs: data.duration,
        timeRemaining: Math.ceil(data.duration / 1000),
        submittedThisRound: false,
        results: [],
        error: null,
      });
    });

    socket.on('timer-tick', (data: { timeRemaining: number }) => {
      update({ timeRemaining: data.timeRemaining });
    });

    socket.on('player-submitted', (data: { playerId: string; waitingFor: number }) => {
      update({ waitingForPlayers: data.waitingFor });
    });

    socket.on('scoring-started', () => {
      update({ phase: 'scoring' });
    });

    socket.on('results-ready', (data: { results: PlayerResult[]; round: number }) => {
      update({ phase: 'reveal', results: data.results });
    });

    socket.on('game-over', (data: { leaderboard: LeaderboardEntry[] }) => {
      update({ phase: 'leaderboard', leaderboard: data.leaderboard });
    });

    socket.on('player-left', (data: { players: Player[] | Record<string, Player> }) => {
      const players = Array.isArray(data.players)
        ? data.players
        : Object.values(data.players);
      update({ players });
    });

    socket.on('error', (data: { message: string }) => {
      update({ error: data.message });
    });

    return () => {
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Actions ───────────────────────────────────────────────────────────
  const setReady = (isReady: boolean) => {
    socketRef.current?.emit('player-ready', { isReady });
  };

  const startGame = () => {
    socketRef.current?.emit('start-game');
  };

  const nextRound = () => {
    socketRef.current?.emit('next-round');
  };

  const playAgain = () => {
    socketRef.current?.emit('play-again');
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
      socketRef.current?.emit('submit-prompt', {
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
        prompt,
        imageData: null,
        tokensUsed,
      });
      update({ submittedThisRound: true });
    } finally {
      setGenerating(false);
    }
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
  const allReady = gs.players.length >= 2 && gs.players.every(p => p.isReady);

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
        canStart={allReady && gs.players.length >= 2}
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
}: {
  gs: GameState;
  generating: boolean;
  generatedImage: string | null;
  genError: string | null;
  onSubmit: (prompt: string, tokensUsed: number) => void;
}) {
  const totalSeconds = Math.ceil(gs.roundDurationMs / 1000);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
        <CountdownTimer timeRemaining={gs.timeRemaining} totalSeconds={totalSeconds} />
      </div>

      {/* Progress bar for timer */}
      <div className="progress-track">
        <div
          className={`progress-fill ${gs.timeRemaining <= 10 ? 'danger' : gs.timeRemaining <= 30 ? 'warning' : 'safe'}`}
          style={{ width: `${(gs.timeRemaining / totalSeconds) * 100}%` }}
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
                {gs.referenceImage.difficulty}
              </span>
              <span className="badge badge-category">
                {gs.referenceImage.category}
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
            </div>
            <PromptEditor
              budget={gs.tokenBudget}
              onSubmit={onSubmit}
              disabled={false}
              generating={generating}
            />
          </div>

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
