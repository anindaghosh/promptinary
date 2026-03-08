const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── Firebase Admin ──────────────────────────────────────────────────────────
let adminDb = null;

function initFirebase() {
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      adminDb = admin.firestore();
      return;
    }
    const projectId   = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
      admin.initializeApp({ projectId });
    }
    adminDb = admin.firestore();
    console.log('[Firebase] Admin SDK initialized');
  } catch (err) {
    console.warn('[Firebase] Admin SDK init failed — persistence disabled:', err.message);
  }
}

async function persistGameHistory(room, finalScores) {
  if (!adminDb) return;
  try {
    const gameId = uuidv4();
    const players = Array.from(room.players.values());

    // Write game history
    await adminDb.collection('gameHistory').doc(gameId).set({
      gameId,
      roomCode: room.code,
      completedAt: new Date(),
      totalRounds: room.totalRounds,
      players: players.map(p => ({ playerId: p.id, firebaseUid: p.firebaseUid || null, name: p.name, avatar: p.avatar })),
      roundResults: room.roundResults,
      finalScores,
    });

    // Update each player's stats in users/{uid}
    for (const entry of finalScores) {
      const uid = room.players.get(entry.playerId)?.firebaseUid;
      if (!uid) continue;
      try {
        const ref = adminDb.collection('users').doc(uid);
        const snap = await ref.get();
        if (snap.exists) {
          const data = snap.data();
          await ref.update({
            gamesPlayed: (data.gamesPlayed || 0) + 1,
            totalScore: (data.totalScore || 0) + entry.total,
            bestScore: Math.max(data.bestScore || 0, entry.total),
          });
        }
      } catch (e) {
        console.warn('[Firebase] Failed to update user stats for', uid, e.message);
      }
    }

    console.log(`[Firebase] Game history saved: ${gameId}`);
  } catch (err) {
    console.warn('[Firebase] Failed to persist game history:', err.message);
  }
}

async function validateTeamMembership(teamId, firebaseUid) {
  if (!adminDb || !teamId || !firebaseUid) return true; // no restriction
  try {
    const snap = await adminDb.collection('teams').doc(teamId).get();
    if (!snap.exists) return false;
    const data = snap.data();
    return (data.memberUids || []).includes(firebaseUid);
  } catch {
    return true; // fail open if Firestore unavailable
  }
}

// ─── Game State ─────────────────────────────────────────────────────────────
const rooms = new Map(); // roomCode → Room
const ROUND_DURATION_MS = 90_000; // 90 seconds per round
const TOTAL_ROUNDS = 3;
const TOKEN_BUDGET = 120;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(hostId, hostName, firebaseUid, teamId = null) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId,
    teamId,
    phase: 'lobby',
    players: new Map(),
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
    currentImageId: null,
    roundStartTime: null,
    roundTimer: null,
    submissions: new Map(),
    scores: new Map(),
    roundResults: [],
  };
  room.players.set(hostId, {
    id: hostId,
    name: hostName,
    isReady: false,
    isHost: true,
    avatar: getAvatar(hostName),
    firebaseUid: firebaseUid || null,
  });
  rooms.set(code, room);
  return room;
}

function getAvatar(name) {
  const avatars = ['🦸', '🧙', '🤖', '👾', '🦊', '🐉', '🦅', '🐺', '🦁', '🐯'];
  const idx = (name || 'A').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatars.length;
  return avatars[idx];
}

function getRoomState(room) {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    teamId: room.teamId,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    currentImageId: room.currentImageId,
    roundStartTime: room.roundStartTime,
    players: Array.from(room.players.values()),
    submissions: Array.from(room.submissions.entries()).map(([id, s]) => ({
      playerId: id, hasSubmitted: true, prompt: s.prompt,
    })),
    scores: Array.from(room.scores.entries()).map(([id, s]) => ({
      playerId: id, total: s.total, roundScores: s.roundScores,
    })),
    roundResults: room.roundResults,
  };
}

// ─── Reference Images ────────────────────────────────────────────────────────
const REFERENCE_IMAGES = [
  { id: 'img-001', filename: 'starry-night.jpg',    category: 'Fine Art',     difficulty: 'Hard',   title: 'Starry Night Style' },
  { id: 'img-002', filename: 'mountain-lake.jpg',   category: 'Photography',  difficulty: 'Medium', title: 'Mountain Lake' },
  { id: 'img-003', filename: 'neon-city.jpg',        category: 'Concept Art',  difficulty: 'Hard',   title: 'Neon Cityscape' },
  { id: 'img-004', filename: 'cherry-blossom.jpg',  category: 'Nature',       difficulty: 'Easy',   title: 'Cherry Blossoms' },
  { id: 'img-005', filename: 'lighthouse.jpg',      category: 'Architecture', difficulty: 'Medium', title: 'Lighthouse at Dusk' },
  { id: 'img-006', filename: 'hot-air-balloon.jpg', category: 'Photography',  difficulty: 'Medium', title: 'Hot Air Balloons' },
  { id: 'img-007', filename: 'underwater.jpg',      category: 'Nature',       difficulty: 'Hard',   title: 'Underwater Coral' },
  { id: 'img-008', filename: 'desert-dunes.jpg',    category: 'Photography',  difficulty: 'Easy',   title: 'Desert Dunes' },
  { id: 'img-009', filename: 'space-nebula.jpg',    category: 'Concept Art',  difficulty: 'Hard',   title: 'Space Nebula' },
  { id: 'img-010', filename: 'autumn-forest.jpg',   category: 'Nature',       difficulty: 'Easy',   title: 'Autumn Forest' },
  { id: 'img-011', filename: 'tokyo-street.jpg',    category: 'Photography',  difficulty: 'Medium', title: 'Tokyo Street' },
  { id: 'img-012', filename: 'abstract-waves.jpg',  category: 'Fine Art',     difficulty: 'Hard',   title: 'Abstract Waves' },
  { id: 'img-013', filename: 'castle-ruins.jpg',    category: 'Architecture', difficulty: 'Medium', title: 'Castle Ruins' },
  { id: 'img-014', filename: 'arctic-fox.jpg',      category: 'Nature',       difficulty: 'Medium', title: 'Arctic Fox' },
  { id: 'img-015', filename: 'art-deco.jpg',        category: 'Architecture', difficulty: 'Hard',   title: 'Art Deco Interior' },
  { id: 'img-016', filename: 'tulip-fields.jpg',    category: 'Nature',       difficulty: 'Easy',   title: 'Tulip Fields' },
  { id: 'img-017', filename: 'steampunk.jpg',       category: 'Concept Art',  difficulty: 'Hard',   title: 'Steampunk City' },
  { id: 'img-018', filename: 'greek-island.jpg',    category: 'Photography',  difficulty: 'Easy',   title: 'Greek Island' },
  { id: 'img-019', filename: 'cubist-portrait.jpg', category: 'Fine Art',     difficulty: 'Hard',   title: 'Cubist Portrait' },
  { id: 'img-020', filename: 'waterfall.jpg',       category: 'Nature',       difficulty: 'Medium', title: 'Jungle Waterfall' },
];

function getRandomImage(usedIds = []) {
  const available = REFERENCE_IMAGES.filter(img => !usedIds.includes(img.id));
  if (available.length === 0) return REFERENCE_IMAGES[Math.floor(Math.random() * REFERENCE_IMAGES.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function calculateScore({ similarityScore, tokensUsed, tokenBudget, submissionTimeMs, roundDurationMs }) {
  const simScore       = Math.min(100, Math.max(0, similarityScore)) * 0.60;
  const savedTokens    = Math.max(0, tokenBudget - tokensUsed);
  const effScore       = (savedTokens / tokenBudget) * 100 * 0.25;
  const normalizedTime = Math.max(0, Math.min(1, submissionTimeMs / roundDurationMs));
  const speedScore     = (1 - normalizedTime) * 100 * 0.15;
  return Math.round(simScore + effScore + speedScore);
}

// ─── Server Start ────────────────────────────────────────────────────────────
app.prepare().then(() => {
  initFirebase();

  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Create Room ──────────────────────────────────────────────────────────
    socket.on('create-room', ({ playerName, firebaseUid, teamId }) => {
      const room = createRoom(socket.id, playerName || 'Player 1', firebaseUid, teamId || null);
      room.scores.set(socket.id, { total: 0, roundScores: [] });
      socket.join(room.code);
      socket.emit('room-created', { code: room.code, state: getRoomState(room) });
      console.log(`[Room] Created: ${room.code} by ${playerName}`);
    });

    // ── Join Room ────────────────────────────────────────────────────────────
    socket.on('join-room', async ({ roomCode, playerName, firebaseUid }) => {
      const code = roomCode.toUpperCase();
      const room = rooms.get(code);
      if (!room) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (room.phase !== 'lobby') { socket.emit('error', { message: 'Game already in progress!' }); return; }
      if (room.players.size >= 8) { socket.emit('error', { message: 'Room is full (8 players max)!' }); return; }

      // Team membership check
      if (room.teamId) {
        const allowed = await validateTeamMembership(room.teamId, firebaseUid);
        if (!allowed) {
          socket.emit('error', { message: 'You are not a member of this team!' });
          return;
        }
      }

      room.players.set(socket.id, {
        id: socket.id,
        name: playerName || `Player ${room.players.size + 1}`,
        isReady: false,
        isHost: false,
        avatar: getAvatar(playerName || 'Player'),
        firebaseUid: firebaseUid || null,
      });
      room.scores.set(socket.id, { total: 0, roundScores: [] });
      socket.join(code);
      socket.emit('room-joined', { code, state: getRoomState(room) });
      io.to(code).emit('room-update', getRoomState(room));
      console.log(`[Room] ${playerName} joined: ${code}`);
    });

    // ── Player Ready ─────────────────────────────────────────────────────────
    socket.on('player-ready', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;
      player.isReady = !player.isReady;
      io.to(roomCode).emit('room-update', getRoomState(room));
    });

    // ── Start Game ───────────────────────────────────────────────────────────
    socket.on('start-game', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socket.id) return;
      if (room.players.size < 1) return;
      startNextRound(io, room);
    });

    // ── Submit Prompt ────────────────────────────────────────────────────────
    socket.on('submit-prompt', ({ roomCode, prompt, imageData, tokensUsed }) => {
      const room = rooms.get(roomCode);
      if (!room || room.phase !== 'playing') return;
      if (room.submissions.has(socket.id)) return;

      const submittedAt = Date.now();
      const submissionTimeMs = submittedAt - room.roundStartTime;
      room.submissions.set(socket.id, { prompt, imageData, tokensUsed, submittedAt, submissionTimeMs });

      io.to(roomCode).emit('player-submitted', { playerId: socket.id, playerName: room.players.get(socket.id)?.name });
      io.to(roomCode).emit('room-update', getRoomState(room));

      if (room.submissions.size >= room.players.size) {
        clearTimeout(room.roundTimer);
        startScoring(io, room);
      }
    });

    // ── Next Round ───────────────────────────────────────────────────────────
    socket.on('next-round', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socket.id) return;
      if (room.currentRound >= room.totalRounds) {
        endGame(io, room);
      } else {
        startNextRound(io, room);
      }
    });

    // ── Play Again ───────────────────────────────────────────────────────────
    socket.on('play-again', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socket.id) return;
      room.currentRound = 0;
      room.submissions.clear();
      room.roundResults = [];
      room.scores.forEach((s) => { s.total = 0; s.roundScores = []; });
      room.phase = 'lobby';
      room.players.forEach(p => { p.isReady = false; });
      io.to(roomCode).emit('room-update', getRoomState(room));
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      rooms.forEach((room, code) => {
        if (room.players.has(socket.id)) {
          room.players.delete(socket.id);
          room.submissions.delete(socket.id);
          if (room.players.size === 0) {
            clearTimeout(room.roundTimer);
            rooms.delete(code);
            console.log(`[Room] Deleted empty room: ${code}`);
          } else {
            if (room.hostId === socket.id) {
              const newHost = room.players.values().next().value;
              if (newHost) { newHost.isHost = true; room.hostId = newHost.id; }
            }
            io.to(code).emit('room-update', getRoomState(room));
            io.to(code).emit('player-left', { playerId: socket.id });
          }
        }
      });
    });
  });

  function startNextRound(io, room) {
    room.currentRound++;
    room.phase = 'countdown';
    room.submissions.clear();
    room.roundResults = [];

    const image = getRandomImage([]);
    room.currentImageId = image.id;

    // Send all round data upfront — client drives visual countdown locally
    io.to(room.code).emit('game-start', {
      round: room.currentRound,
      totalRounds: room.totalRounds,
      image: { id: image.id, url: `/reference-images/${image.filename}`, category: image.category, difficulty: image.difficulty, title: image.title },
      tokenBudget: TOKEN_BUDGET,
      duration: ROUND_DURATION_MS,
    });

    // 3 seconds countdown on server before opening for submissions
    setTimeout(() => {
      room.phase = 'playing';
      room.roundStartTime = Date.now();
      io.to(room.code).emit('round-playing', { startTime: room.roundStartTime });
      io.to(room.code).emit('room-update', getRoomState(room));

      let timeLeft = ROUND_DURATION_MS / 1000;
      const tickInterval = setInterval(() => {
        timeLeft--;
        io.to(room.code).emit('timer-tick', { timeLeft });
        if (timeLeft <= 0) clearInterval(tickInterval);
      }, 1000);

      room.roundTimer = setTimeout(() => {
        clearInterval(tickInterval);
        startScoring(io, room);
      }, ROUND_DURATION_MS);
    }, 3000);
  }

  async function startScoring(io, room) {
    room.phase = 'scoring';
    io.to(room.code).emit('room-update', getRoomState(room));
    io.to(room.code).emit('scoring-started', { message: 'Gemini is judging your prompts...' });

    const results = [];

    for (const [playerId, submission] of room.submissions.entries()) {
      const player = room.players.get(playerId);
      if (!player) continue;

      let similarityScore = 0;
      let reasoning       = 'No image submitted.';
      let scoreBreakdown  = {};

      if (submission.imageData) {
        try {
          const response = await fetch(`http://localhost:${port}/api/score-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referenceImageId: room.currentImageId,
              generatedImageBase64: submission.imageData,
            }),
          });
          const data = await response.json();
          similarityScore = data.similarityScore ?? 0;
          reasoning       = data.reasoning ?? '';
          scoreBreakdown  = data.breakdown ?? {};
        } catch (err) {
          console.error('[Scoring] Error:', err);
        }
      }

      const roundScore = calculateScore({
        similarityScore,
        tokensUsed:       submission.tokensUsed || 0,
        tokenBudget:      TOKEN_BUDGET,
        submissionTimeMs: submission.submissionTimeMs || ROUND_DURATION_MS,
        roundDurationMs:  ROUND_DURATION_MS,
      });

      const playerScore = room.scores.get(playerId);
      if (playerScore) {
        playerScore.roundScores.push(roundScore);
        playerScore.total += roundScore;
      }

      results.push({
        playerId,
        playerName:     player.name,
        playerAvatar:   player.avatar,
        prompt:         submission.prompt,
        imageData:      submission.imageData,
        tokensUsed:     submission.tokensUsed,
        similarityScore,
        scoreBreakdown,
        roundScore,
        reasoning,
      });
    }

    results.sort((a, b) => b.roundScore - a.roundScore);
    room.roundResults = results;
    room.phase = 'reveal';

    const scores = Array.from(room.scores.entries()).map(([id, s]) => ({
      playerId:    id,
      playerName:  room.players.get(id)?.name,
      playerAvatar: room.players.get(id)?.avatar,
      total:       s.total,
      roundScores: s.roundScores,
    })).sort((a, b) => b.total - a.total);

    io.to(room.code).emit('room-update', getRoomState(room));
    io.to(room.code).emit('results-ready', {
      results,
      scores,
      isLastRound: room.currentRound >= room.totalRounds,
    });
  }

  async function endGame(io, room) {
    room.phase = 'leaderboard';
    const finalScores = Array.from(room.scores.entries()).map(([id, s]) => ({
      playerId:    id,
      playerName:  room.players.get(id)?.name,
      playerAvatar: room.players.get(id)?.avatar,
      total:       s.total,
      roundScores: s.roundScores,
    })).sort((a, b) => b.total - a.total);

    io.to(room.code).emit('game-over', { finalScores });
    io.to(room.code).emit('room-update', getRoomState(room));

    // Persist to Firestore (non-blocking)
    persistGameHistory(room, finalScores);
  }

  httpServer.listen(port, () => {
    console.log(`\n🎮 Promptinary running at http://${hostname}:${port}\n`);
  });
});
