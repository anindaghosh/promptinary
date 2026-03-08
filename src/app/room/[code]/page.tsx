'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import CountdownTimer from '@/components/CountdownTimer';
import PlayerList from '@/components/PlayerList';
import PromptEditor from '@/components/PromptEditor';
import ResultsReveal from '@/components/ResultsReveal';
import Leaderboard from '@/components/Leaderboard';

// ── Types ──────────────────────────────────────────────────────────────

interface Player {
  id: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
  avatar: string;
  firebaseUid?: string;
}

interface ReferenceImage {
  id: string;
  url: string;
  category: string;
  difficulty: string;
  title: string;
}

interface PlayerResult {
  playerId: string;
  playerName: string;
  avatar: string;
  prompt: string;
  imageData: string | null;
  tokensUsed: number;
  similarityScore: number;
  scoreBreakdown?: {
    composition: number;
    colorPalette: number;
    subjectContent: number;
    styleAtmosphere: number;
  };
  totalScore: number;
  reasoning: string;
  rank: number;
}

interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  avatar: string;
  totalScore: number;
  rank: number;
}

// Matches the flat getRoomState() shape from server.js
interface ServerRoomState {
  code: string;
  phase: string;
  hostId: string;
  currentRound: number;
  totalRounds: number;
  players: Player[];
  scores: { playerId: string; total: number }[];
}

type GamePhase = 'connecting' | 'lobby' | 'countdown' | 'playing' | 'scoring' | 'reveal' | 'leaderboard';

interface GameState {
  phase: GamePhase;
  actualCode: string | null;
  mySocketId: string | null;
  myFirebaseUid: string | null;
  players: Player[];
  currentRound: number;
  totalRounds: number;
  referenceImage: ReferenceImage | null;
  tokenBudget: number;
  roundDurationMs: number;
  timeRemaining: number;
  countdownValue: number;
  submittedThisRound: boolean;
  waitingForPlayers: number;
  results: PlayerResult[];
  leaderboard: LeaderboardEntry[];
  error: string | null;
  isConnected: boolean;
}

const INITIAL: GameState = {
  phase: 'connecting',
  actualCode: null,
  mySocketId: null,
  myFirebaseUid: null,
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

// ── Component ──────────────────────────────────────────────────────────

export default function GameRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();

  // URL code: 'new' means create a room, otherwise join that code
  const urlCode = (params?.code as string ?? '').toUpperCase();
  const isCreating = urlCode === 'NEW';

  const socketRef  = useRef<Socket | null>(null);
  const [gs, setGs] = useState<GameState>(INITIAL);
  const [generating, setGenerating]     = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [genError, setGenError]         = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  // Pending round metadata received from game-start (needed when round-playing fires)
  const pendingRoundRef = useRef<{
    round: number; totalRounds: number; image: ReferenceImage;
    tokenBudget: number; duration: number;
  } | null>(null);

  // Client-side countdown interval
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const update = useCallback((patch: Partial<GameState>) => {
    setGs(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Socket lifecycle ────────────────────────────────────────────────

  useEffect(() => {
    // Wait until auth is resolved before connecting
    if (user === null) return;

    const playerName   = profile?.displayName || localStorage.getItem('promptinary_name') || 'Anonymous';
    const firebaseUid  = user.uid;

    const socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      update({ isConnected: true, mySocketId: socket.id ?? null, myFirebaseUid: firebaseUid });

      if (isCreating) {
        socket.emit('create-room', { playerName, firebaseUid });
      } else {
        socket.emit('join-room', { roomCode: urlCode, playerName, firebaseUid });
      }
    });

    socket.on('disconnect', () => {
      update({ isConnected: false });
    });

    // ── room-created: { code, state } ──────────────────────────────
    socket.on('room-created', (data: { code: string; state: ServerRoomState }) => {
      const players = data.state?.players ?? [];
      update({
        phase: 'lobby',
        actualCode: data.code,
        players,
        mySocketId: socket.id ?? null,
        error: null,
      });
    });

    // ── room-joined: { code, state } ──────────────────────────────
    socket.on('room-joined', (data: { code: string; state: ServerRoomState }) => {
      const players = data.state?.players ?? [];
      update({
        phase: 'lobby',
        actualCode: data.code,
        players,
        currentRound: data.state.currentRound,
        totalRounds: data.state.totalRounds,
        error: null,
      });
    });

    // ── room-update: flat getRoomState() object ────────────────────
    socket.on('room-update', (data: ServerRoomState) => {
      update({ players: data.players ?? [] });
    });

    // ── game-start: contains round metadata + image ────────────────
    // Server sends this before the 3-second countdown, then emits round-playing
    socket.on('game-start', (data: {
      round: number; totalRounds: number;
      image: ReferenceImage; tokenBudget: number; duration: number;
    }) => {
      // Store round data for when round-playing arrives
      pendingRoundRef.current = data;

      // Start local 3→2→1 visual countdown
      if (countdownRef.current) clearInterval(countdownRef.current);
      let count = 3;
      update({ phase: 'countdown', countdownValue: count, error: null });
      countdownRef.current = setInterval(() => {
        count--;
        if (count > 0) {
          update({ countdownValue: count });
        } else {
          if (countdownRef.current) clearInterval(countdownRef.current);
        }
      }, 1000);
    });

    // ── round-playing: { startTime } — actual round begins ────────
    socket.on('round-playing', () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      const rd = pendingRoundRef.current;
      if (!rd) return;

      setGeneratedImage(null);
      setGenError(null);
      setGenerating(false);

      update({
        phase: 'playing',
        currentRound: rd.round,
        totalRounds: rd.totalRounds,
        referenceImage: rd.image,
        tokenBudget: rd.tokenBudget,
        roundDurationMs: rd.duration,
        timeRemaining: Math.ceil(rd.duration / 1000),
        submittedThisRound: false,
        results: [],
        error: null,
      });
    });

    // ── timer-tick: { timeLeft } ───────────────────────────────────
    socket.on('timer-tick', (data: { timeLeft: number }) => {
      update({ timeRemaining: data.timeLeft });
    });

    // ── player-submitted: another player submitted ────────────────
    socket.on('player-submitted', (data: { playerId: string; playerName: string }) => {
      setGs(prev => ({
        ...prev,
        waitingForPlayers: Math.max(0, prev.waitingForPlayers - 1),
      }));
    });

    // ── scoring-started ────────────────────────────────────────────
    socket.on('scoring-started', () => {
      update({ phase: 'scoring' });
    });

    // ── results-ready: { results, scores, isLastRound } ───────────
    socket.on('results-ready', (data: {
      results: Array<{
        playerId: string; playerName: string; playerAvatar: string;
        prompt: string; imageData: string | null; tokensUsed: number;
        similarityScore: number; scoreBreakdown?: PlayerResult['scoreBreakdown'];
        roundScore: number; reasoning: string;
      }>;
      scores: Array<{ playerId: string; playerName: string; playerAvatar: string; total: number }>;
      isLastRound: boolean;
    }) => {
      // Map server field names → client type names
      const results: PlayerResult[] = data.results.map((r, i) => ({
        playerId:       r.playerId,
        playerName:     r.playerName,
        avatar:         r.playerAvatar,
        prompt:         r.prompt,
        imageData:      r.imageData,
        tokensUsed:     r.tokensUsed,
        similarityScore: r.similarityScore,
        scoreBreakdown: r.scoreBreakdown,
        totalScore:     r.roundScore,
        reasoning:      r.reasoning,
        rank:           i + 1,
      }));
      update({ phase: 'reveal', results });
    });

    // ── game-over: { finalScores } ─────────────────────────────────
    socket.on('game-over', (data: {
      finalScores: Array<{ playerId: string; playerName: string; playerAvatar: string; total: number }>;
    }) => {
      const leaderboard: LeaderboardEntry[] = data.finalScores.map((s, i) => ({
        playerId:   s.playerId,
        playerName: s.playerName,
        avatar:     s.playerAvatar,
        totalScore: s.total,
        rank:       i + 1,
      }));
      update({ phase: 'leaderboard', leaderboard });
    });

    // ── player-left ────────────────────────────────────────────────
    socket.on('player-left', (data: { playerId: string }) => {
      setGs(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== data.playerId),
      }));
    });

    socket.on('error', (data: { message: string }) => {
      update({ error: data.message });
    });

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Helpers ─────────────────────────────────────────────────────────

  // The room code to use in all outgoing events
  const roomCode = gs.actualCode ?? (isCreating ? null : urlCode);

  const setReady = () => {
    if (!roomCode) return;
    socketRef.current?.emit('player-ready', { roomCode });
  };

  const startGame = () => {
    if (!roomCode) return;
    socketRef.current?.emit('start-game', { roomCode });
  };

  const nextRound = () => {
    if (!roomCode) return;
    const isGameOver = gs.currentRound >= gs.totalRounds;
    if (isGameOver) {
      socketRef.current?.emit('next-round', { roomCode }); // server calls endGame
    } else {
      socketRef.current?.emit('next-round', { roomCode });
    }
  };

  const playAgain = () => {
    if (!roomCode) return;
    socketRef.current?.emit('play-again', { roomCode });
    update({ phase: 'lobby', currentRound: 0, results: [], leaderboard: [], submittedThisRound: false });
  };

  const handlePromptSubmit = async (prompt: string, tokensUsed: number) => {
    if (!roomCode) return;
    setGenerating(true);
    setGenError(null);

    try {
      // Generate the image
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, roomCode, round: gs.currentRound, uid: user?.uid }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Image generation failed');
      }

      // Prefer the Storage URL returned by the API; fall back to base64 if Storage isn't set up yet
      const imagePayload: string | null = data.imageUrl ?? data.imageData ?? null;
      setGeneratedImage(imagePayload);

      socketRef.current?.emit('submit-prompt', {
        roomCode,
        prompt,
        imageData: imagePayload,
        tokensUsed,
      });
      update({ submittedThisRound: true, waitingForPlayers: gs.players.length - 1 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate image';
      setGenError(message);
      // Submit without image so the player isn't stuck
      socketRef.current?.emit('submit-prompt', { roomCode, prompt, imageData: null, tokensUsed });
      update({ submittedThisRound: true });
    } finally {
      setGenerating(false);
    }
  };

  const copyRoomCode = () => {
    const code = roomCode ?? urlCode;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Derived ─────────────────────────────────────────────────────────

  const myPlayer = gs.players.find(p => p.id === gs.mySocketId);
  const isHost   = myPlayer?.isHost ?? false;
  // Host can start once they're ready and there are 2+ players.
  // Other players don't all need to be ready — the host controls when to begin.
  const hostIsReady = myPlayer?.isReady ?? false;
  const allReady = gs.players.length >= 1 && hostIsReady;
  const displayCode = roomCode ?? urlCode;

  // ── Render ──────────────────────────────────────────────────────────

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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--black)', opacity: 0.6, padding: '4px 0' }}
          >
            ← Home
          </button>

          {displayCode && displayCode !== 'NEW' && (
            <button
              onClick={copyRoomCode}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                background: 'var(--black)', color: 'var(--white)',
                border: 'var(--border)', borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', letterSpacing: '0.08em',
                boxShadow: 'var(--shadow-sm)', transition: 'all 120ms ease',
              }}
            >
              {copied ? '✓ Copied!' : `# ${displayCode}`}
            </button>
          )}
        </div>

        {/* Error banner */}
        {gs.error && (
          <div style={{
            marginBottom: 16, padding: '10px 14px',
            background: 'var(--coral)', border: 'var(--border)',
            borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)',
            fontWeight: 500, fontSize: 13, color: 'var(--white)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{gs.error}</span>
            <button onClick={() => update({ error: null })}
              style={{ background: 'none', border: 'none', color: 'var(--white)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>
              ×
            </button>
          </div>
        )}

        {/* Connecting state */}
        {gs.phase === 'connecting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.6 }}>Connecting...</p>
          </div>
        )}

        {gs.phase === 'lobby' && (
          <LobbyView gs={gs} isHost={isHost} allReady={allReady} onToggleReady={setReady} onStartGame={startGame} onCopyCode={copyRoomCode} />
        )}

        {gs.phase === 'countdown' && (
          <CountdownView value={gs.countdownValue} />
        )}

        {gs.phase === 'playing' && (
          <PlayingView gs={gs} generating={generating} generatedImage={generatedImage} genError={genError} onSubmit={handlePromptSubmit} />
        )}

        {gs.phase === 'scoring' && <ScoringView />}

        {gs.phase === 'reveal' && (
          <div>
            <ResultsReveal results={gs.results} referenceImage={gs.referenceImage} myPlayerId={gs.mySocketId} />
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

        {gs.phase === 'leaderboard' && (
          <Leaderboard
            entries={gs.leaderboard}
            myPlayerId={gs.mySocketId}
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

// ── Sub-views ──────────────────────────────────────────────────────────

function LobbyView({ gs, isHost, allReady, onToggleReady, onStartGame, onCopyCode }: {
  gs: GameState; isHost: boolean; allReady: boolean;
  onToggleReady: () => void; onStartGame: () => void; onCopyCode: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="animate-slide-up">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, marginBottom: 6 }}>Lobby</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.6 }}>Share the room code to invite friends</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatCard label="Players" value={`${gs.players.length} / 8`} color="var(--sky)" />
        <StatCard label="Rounds"  value={`${gs.totalRounds}`} color="var(--gold)" />
      </div>

      <div className="stripe-divider" />

      <PlayerList
        players={gs.players}
        myPlayerId={gs.mySocketId}
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
    <div style={{ padding: '14px 16px', background: color, border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{value}</div>
    </div>
  );
}

function CountdownView({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 16, opacity: 0.7 }}>Get ready!</p>
      <div key={value} className="animate-bounce-in" style={{
        fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 120, lineHeight: 1,
        color: value <= 1 ? 'var(--coral)' : value <= 2 ? 'var(--orange)' : 'var(--teal)',
      }}>
        {value}
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.5 }}>Round starting...</p>
    </div>
  );
}

function PlayingView({ gs, generating, generatedImage, genError, onSubmit }: {
  gs: GameState; generating: boolean; generatedImage: string | null;
  genError: string | null; onSubmit: (p: string, t: number) => void;
}) {
  const totalSeconds = Math.ceil(gs.roundDurationMs / 1000);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Round</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28 }}>{gs.currentRound} / {gs.totalRounds}</div>
        </div>
        <CountdownTimer timeRemaining={gs.timeRemaining} totalSeconds={totalSeconds} />
      </div>

      <div className="progress-track">
        <div className={`progress-fill ${gs.timeRemaining <= 10 ? 'danger' : gs.timeRemaining <= 30 ? 'warning' : 'safe'}`}
          style={{ width: `${(gs.timeRemaining / totalSeconds) * 100}%` }} />
      </div>

      {gs.referenceImage && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>Target Image</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className={`badge badge-${gs.referenceImage.difficulty.toLowerCase()}`}>{gs.referenceImage.difficulty}</span>
              <span className="badge badge-category">{gs.referenceImage.category}</span>
            </div>
          </div>
          <div style={{ border: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gs.referenceImage.url} alt={gs.referenceImage.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
          </div>
          <div style={{ marginTop: 6, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
            {gs.referenceImage.title}
          </div>
        </div>
      )}

      {gs.submittedThisRound ? (
        <SubmittedView generatedImage={generatedImage} waitingFor={gs.waitingForPlayers} />
      ) : (
        <>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Write Your Prompt</div>
            <PromptEditor budget={gs.tokenBudget} onSubmit={onSubmit} generating={generating} />
          </div>
          {genError && (
            <div style={{ padding: '10px 14px', background: 'var(--coral)', border: 'var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)' }}>
              ⚠️ {genError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubmittedView({ generatedImage, waitingFor }: { generatedImage: string | null; waitingFor: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--teal)', border: 'var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', color: 'var(--white)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>Submitted!</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, marginTop: 6, opacity: 0.85 }}>
          Waiting for {waitingFor} more player{waitingFor !== 1 ? 's' : ''}...
        </div>
      </div>

      {generatedImage && (
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Your Generated Image</div>
          <div style={{ border: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={generatedImage} alt="Your generated image" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
        <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, opacity: 0.7 }}>AI is scoring submissions...</span>
      </div>
    </div>
  );
}

function ScoringView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 52, animation: 'pulse-ring 1.5s ease-in-out infinite' }}>🤖</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24 }}>Scoring...</h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.6, maxWidth: 240, lineHeight: 1.5 }}>
        Gemini AI is analyzing and scoring all submissions
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 10, height: 10, background: 'var(--teal)', borderRadius: '50%', animation: `pulse-ring 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
    </div>
  );
}
