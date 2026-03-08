'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// ── Types ──────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
  avatar: string;
}

export interface ReferenceImage {
  id: string;
  url: string;
  category: string;
  difficulty: string;
  title: string;
}

export interface ScoreBreakdown {
  composition: number;
  colorPalette: number;
  subjectContent: number;
  styleAtmosphere: number;
}

export interface PlayerResult {
  playerId: string;
  playerName: string;
  playerAvatar?: string;
  avatar?: string;
  prompt: string;
  imageData: string | null;
  tokensUsed: number;
  submissionTimeMs?: number;
  similarityScore: number;
  scoreBreakdown?: ScoreBreakdown;
  roundScore?: number;       // server field
  totalScore?: number;      // alias used by some components
  reasoning: string;
  suggestedPrompt?: string; // AI-generated improved prompt
  rank?: number;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  playerAvatar?: string;
  avatar?: string;
  totalScore: number;
  rank: number;
}

export type GamePhase =
  | 'disconnected'
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'scoring'
  | 'reveal'
  | 'leaderboard';

export type PowerupId =
  | 'TOKEN_DRAIN'
  | 'FREEZE'
  | 'TOKEN_SHIELD'
  | 'HINT'
  | 'DOUBLE_POINTS'
  | 'CATEGORY';

export interface PowerupDefinition {
  id: PowerupId;
  name: string;
  type: 'offensive' | 'defensive' | 'utility';
  emoji: string;
  description: string;
  requiresTarget: boolean;
}

export const POWERUP_DEFS: Record<PowerupId, PowerupDefinition> = {
  TOKEN_DRAIN:   { id: 'TOKEN_DRAIN',   name: 'Token Drain',   type: 'offensive', emoji: '⚡', description: "Cut opponent's token budget by 20", requiresTarget: true },
  FREEZE:        { id: 'FREEZE',        name: 'Freeze',        type: 'offensive', emoji: '❄️',  description: "Pause a player's timer for 10 seconds", requiresTarget: true },
  TOKEN_SHIELD:  { id: 'TOKEN_SHIELD',  name: 'Token Shield',  type: 'defensive', emoji: '🛡️', description: 'Block drain attacks for one round', requiresTarget: false },
  HINT:          { id: 'HINT',          name: 'Hint',          type: 'utility',   emoji: '💡', description: 'Reveal 2 AI keyword suggestions', requiresTarget: false },
  DOUBLE_POINTS: { id: 'DOUBLE_POINTS', name: 'Double Points', type: 'utility',   emoji: '⭐', description: '2× your score this round', requiresTarget: false },
  CATEGORY:      { id: 'CATEGORY',      name: 'Category',      type: 'utility',   emoji: '🏷️', description: 'Reveal style tag of reference image', requiresTarget: false },
};

export interface GameState {
  phase: GamePhase;
  roomCode: string | null;
  myPlayerId: string | null;
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
  // Powerup state
  myPowerup: PowerupId | null;
  powerupUsed: boolean;
  isFrozen: boolean;
  frozenSecondsLeft: number;
  hasShield: boolean;
  hasDoublePoints: boolean;
  hintKeywords: string[];
  revealedCategory: string | null;
  powerupNotification: { message: string; type: 'attack' | 'defend' | 'info' } | null;
  tokenDrainAmount: number;
}

const DEFAULT_STATE: GameState = {
  phase: 'disconnected',
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

// ── Hook ───────────────────────────────────────────────────────────────

export function useGameSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>(DEFAULT_STATE);

  const update = useCallback((patch: Partial<GameState>) => {
    setGameState(prev => ({ ...prev, ...patch }));
  }, []);

  // Connect socket on mount
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    const socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      update({ isConnected: true, phase: 'lobby', myPlayerId: socket.id ?? null });
    });

    socket.on('disconnect', () => {
      update({ isConnected: false, phase: 'disconnected' });
    });

    // Room created — host enters lobby
    socket.on('room-created', (data: { roomCode: string; player: Player }) => {
      update({
        phase: 'lobby',
        roomCode: data.roomCode,
        myPlayerId: data.player.id,
        players: [data.player],
        error: null,
      });
    });

    // Joined an existing room
    socket.on('room-joined', (data: { roomCode: string; player: Player; room: { players: Player[] } }) => {
      update({
        phase: 'lobby',
        roomCode: data.roomCode,
        myPlayerId: data.player.id,
        players: data.room.players,
        error: null,
      });
    });

    // Room state updates (players ready/join/leave)
    socket.on('room-update', (data: { room: { players: Player[]; phase: string } }) => {
      const players = Array.isArray(data.room.players)
        ? data.room.players
        : Object.values(data.room.players as Record<string, Player>);
      update({ players });
    });

    // Host started — countdown begins
    socket.on('game-start', (data: { countdown: number }) => {
      update({ phase: 'countdown', countdownValue: data.countdown, error: null });
    });

    // Countdown tick
    socket.on('countdown-tick', (data: { value: number }) => {
      update({ countdownValue: data.value });
    });

    // Round is now live
    socket.on('round-playing', (data: {
      round: number;
      totalRounds: number;
      image: ReferenceImage;
      tokenBudget: number;
      duration: number;
    }) => {
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

    // Server-authoritative timer
    socket.on('timer-tick', (data: { timeRemaining: number }) => {
      update({ timeRemaining: data.timeRemaining });
    });

    // Another player submitted
    socket.on('player-submitted', (data: { playerId: string; waitingFor: number }) => {
      update({ waitingForPlayers: data.waitingFor });
    });

    // Scoring in progress
    socket.on('scoring-started', () => {
      update({ phase: 'scoring' });
    });

    // All results ready
    socket.on('results-ready', (data: { results: PlayerResult[]; round: number }) => {
      update({ phase: 'reveal', results: data.results });
    });

    // Game over — show final leaderboard
    socket.on('game-over', (data: { leaderboard: LeaderboardEntry[] }) => {
      update({ phase: 'leaderboard', leaderboard: data.leaderboard });
    });

    // A player left
    socket.on('player-left', (data: { players: Player[] }) => {
      const players = Array.isArray(data.players)
        ? data.players
        : Object.values(data.players as Record<string, Player>);
      update({ players });
    });

    // Error from server
    socket.on('error', (data: { message: string }) => {
      update({ error: data.message });
    });

    return () => {
      socket.disconnect();
    };
  }, [update]);

  // ── Action dispatchers ────────────────────────────────────────────────

  const createRoom = useCallback((playerName: string) => {
    socketRef.current?.emit('create-room', { playerName });
  }, []);

  const joinRoom = useCallback((roomCode: string, playerName: string) => {
    socketRef.current?.emit('join-room', { roomCode: roomCode.toUpperCase(), playerName });
  }, []);

  const setReady = useCallback((isReady: boolean) => {
    socketRef.current?.emit('player-ready', { isReady });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('start-game');
  }, []);

  const submitPrompt = useCallback((prompt: string, imageData: string, tokensUsed: number) => {
    socketRef.current?.emit('submit-prompt', { prompt, imageData, tokensUsed });
    setGameState(prev => ({ ...prev, submittedThisRound: true }));
  }, []);

  const nextRound = useCallback(() => {
    socketRef.current?.emit('next-round');
  }, []);

  const playAgain = useCallback(() => {
    socketRef.current?.emit('play-again');
    setGameState(prev => ({
      ...prev,
      phase: 'lobby',
      currentRound: 0,
      results: [],
      leaderboard: [],
      submittedThisRound: false,
    }));
  }, []);

  const clearError = useCallback(() => {
    update({ error: null });
  }, [update]);

  return {
    gameState,
    createRoom,
    joinRoom,
    setReady,
    startGame,
    submitPrompt,
    nextRound,
    playAgain,
    clearError,
    socket: socketRef.current,
  };
}
