const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const NEXT_APP_URL = process.env.NEXT_APP_URL || `http://localhost:${port}`;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── Game State ─────────────────────────────────────────────────────────────
const rooms = new Map(); // roomCode → Room
const ROUND_DURATION_MS = 90_000; // 90 seconds per round
const TOTAL_ROUNDS = 3;
const TOKEN_BUDGET = 120;

// ─── Powerup Definitions ─────────────────────────────────────────────────────
const POWERUP_TYPES = {
  TOKEN_DRAIN:   { id: 'TOKEN_DRAIN',   name: 'Token Drain',   type: 'offensive', emoji: '⚡', description: "Cut opponent's token budget by 20" },
  FREEZE:        { id: 'FREEZE',        name: 'Freeze',        type: 'offensive', emoji: '❄️',  description: "Pause a player's timer for 10 seconds" },
  TOKEN_SHIELD:  { id: 'TOKEN_SHIELD',  name: 'Token Shield',  type: 'defensive', emoji: '🛡️', description: 'Block drain attacks for one round' },
  HINT:          { id: 'HINT',          name: 'Hint',          type: 'utility',   emoji: '💡', description: 'Reveal 2 AI keyword suggestions' },
  DOUBLE_POINTS: { id: 'DOUBLE_POINTS', name: 'Double Points', type: 'utility',   emoji: '⭐', description: '2× your score next round' },
  CATEGORY:      { id: 'CATEGORY',      name: 'Category',      type: 'utility',   emoji: '🏷️', description: 'Reveal style tag of reference image' },
};

// Each player gets one random powerup per round (drawn from this pool)
const POWERUP_POOL = ['TOKEN_DRAIN', 'FREEZE', 'TOKEN_SHIELD', 'HINT', 'DOUBLE_POINTS', 'CATEGORY'];

function dealPowerups(playerIds) {
  const dealt = {};
  for (const id of playerIds) {
    const pick = POWERUP_POOL[Math.floor(Math.random() * POWERUP_POOL.length)];
    dealt[id] = pick;
  }
  return dealt;
}

// Keyword hints per image id
const IMAGE_HINTS = {
  'img-001': ['swirling', 'night sky', 'impasto'],
  'img-002': ['reflection', 'alpine', 'serene'],
  'img-003': ['neon', 'rain-slicked', 'futuristic'],
  'img-004': ['pink petals', 'soft light', 'spring'],
  'img-005': ['beam', 'rocky coast', 'dusk'],
  'img-006': ['colorful', 'sky', 'festival'],
  'img-007': ['coral reef', 'tropical fish', 'blue'],
  'img-008': ['golden sand', 'ripples', 'arid'],
  'img-009': ['nebula', 'cosmic', 'purple haze'],
  'img-010': ['orange leaves', 'forest path', 'fall'],
  'img-011': ['lanterns', 'busy street', 'evening'],
  'img-012': ['fluid', 'blue waves', 'abstract'],
  'img-013': ['stone walls', 'overgrown', 'medieval'],
  'img-014': ['white fur', 'snowy', 'wildlife'],
  'img-015': ['geometric', 'gold accents', '1920s'],
  'img-016': ['rows', 'colorful', 'Netherlands'],
  'img-017': ['gears', 'steam', 'Victorian'],
  'img-018': ['whitewashed', 'blue dome', 'Aegean'],
  'img-019': ['fragmented', 'geometric faces', 'Picasso'],
  'img-020': ['mist', 'lush green', 'tropical'],
};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(hostId, hostName) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId,
    phase: 'lobby', // lobby | countdown | playing | scoring | reveal | leaderboard
    players: new Map(),
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
    currentImageId: null,
    roundStartTime: null,
    roundTimer: null,
    submissions: new Map(), // playerId → { prompt, imageData, submittedAt }
    scores: new Map(),      // playerId → { roundScores: [], total }
    roundResults: [],
    // Powerup state
    powerups: new Map(),        // playerId → powerupId (current round's dealt card)
    usedPowerups: new Map(),    // playerId → Set of used powerupIds this round
    shields: new Set(),         // playerIds with active TOKEN_SHIELD
    doublePoints: new Set(),    // playerIds with DOUBLE_POINTS active next scoring
    frozenPlayers: new Map(),   // playerId → freeze timeout handle
    tokenDrains: new Map(),     // playerId → amount drained this round
  };
  room.players.set(hostId, {
    id: hostId,
    name: hostName,
    isReady: false,
    isHost: true,
    avatar: getAvatar(hostName),
  });
  rooms.set(code, room);
  return room;
}

function getAvatar(name) {
  const avatars = ['🦸', '🧙', '🤖', '👾', '🦊', '🐉', '🦅', '🐺', '🦁', '🐯'];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatars.length;
  return avatars[idx];
}

function getRoomState(room) {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    currentImageId: room.currentImageId,
    roundStartTime: room.roundStartTime,
    players: Array.from(room.players.values()),
    submissions: Array.from(room.submissions.entries()).map(([id, s]) => ({
      playerId: id,
      hasSubmitted: true,
      prompt: s.prompt,
    })),
    scores: Array.from(room.scores.entries()).map(([id, s]) => ({
      playerId: id,
      total: s.total,
      roundScores: s.roundScores,
    })),
    roundResults: room.roundResults,
    powerups: Object.fromEntries(room.powerups),
    shields: Array.from(room.shields),
    doublePoints: Array.from(room.doublePoints),
  };
}

// ─── Reference Images ────────────────────────────────────────────────────────
const REFERENCE_IMAGES = [
  { id: 'img-001', filename: 'starry-night.jpg', category: 'Fine Art', difficulty: 'Hard', title: 'Starry Night Style' },
  { id: 'img-002', filename: 'mountain-lake.jpg', category: 'Photography', difficulty: 'Medium', title: 'Mountain Lake' },
  { id: 'img-003', filename: 'neon-city.jpg', category: 'Concept Art', difficulty: 'Hard', title: 'Neon Cityscape' },
  { id: 'img-004', filename: 'cherry-blossom.jpg', category: 'Nature', difficulty: 'Easy', title: 'Cherry Blossoms' },
  { id: 'img-005', filename: 'lighthouse.jpg', category: 'Architecture', difficulty: 'Medium', title: 'Lighthouse at Dusk' },
  { id: 'img-006', filename: 'hot-air-balloon.jpg', category: 'Photography', difficulty: 'Medium', title: 'Hot Air Balloons' },
  { id: 'img-007', filename: 'underwater.jpg', category: 'Nature', difficulty: 'Hard', title: 'Underwater Coral' },
  { id: 'img-008', filename: 'desert-dunes.jpg', category: 'Photography', difficulty: 'Easy', title: 'Desert Dunes' },
  { id: 'img-009', filename: 'space-nebula.jpg', category: 'Concept Art', difficulty: 'Hard', title: 'Space Nebula' },
  { id: 'img-010', filename: 'autumn-forest.jpg', category: 'Nature', difficulty: 'Easy', title: 'Autumn Forest' },
  { id: 'img-011', filename: 'tokyo-street.jpg', category: 'Photography', difficulty: 'Medium', title: 'Tokyo Street' },
  { id: 'img-012', filename: 'abstract-waves.jpg', category: 'Fine Art', difficulty: 'Hard', title: 'Abstract Waves' },
  { id: 'img-013', filename: 'castle-ruins.jpg', category: 'Architecture', difficulty: 'Medium', title: 'Castle Ruins' },
  { id: 'img-014', filename: 'arctic-fox.jpg', category: 'Nature', difficulty: 'Medium', title: 'Arctic Fox' },
  { id: 'img-015', filename: 'art-deco.jpg', category: 'Architecture', difficulty: 'Hard', title: 'Art Deco Interior' },
  { id: 'img-016', filename: 'tulip-fields.jpg', category: 'Nature', difficulty: 'Easy', title: 'Tulip Fields' },
  { id: 'img-017', filename: 'steampunk.jpg', category: 'Concept Art', difficulty: 'Hard', title: 'Steampunk City' },
  { id: 'img-018', filename: 'greek-island.jpg', category: 'Photography', difficulty: 'Easy', title: 'Greek Island' },
  { id: 'img-019', filename: 'cubist-portrait.jpg', category: 'Fine Art', difficulty: 'Hard', title: 'Cubist Portrait' },
  { id: 'img-020', filename: 'waterfall.jpg', category: 'Nature', difficulty: 'Medium', title: 'Jungle Waterfall' },
];

function getRandomImage(usedIds = []) {
  const available = REFERENCE_IMAGES.filter(img => !usedIds.includes(img.id));
  if (available.length === 0) return REFERENCE_IMAGES[Math.floor(Math.random() * REFERENCE_IMAGES.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function calculateScore({ similarityScore, tokensUsed, tokenBudget, submissionTimeMs, roundDurationMs }) {
  const simScore = Math.min(100, Math.max(0, similarityScore)) * 0.60;
  const savedTokens = Math.max(0, tokenBudget - tokensUsed);
  const effScore = (savedTokens / tokenBudget) * 100 * 0.25;
  const normalizedTime = Math.max(0, Math.min(1, submissionTimeMs / roundDurationMs));
  const speedScore = (1 - normalizedTime) * 100 * 0.15;
  return Math.round(simScore + effScore + speedScore);
}

// ─── Socket.io Game Logic ─────────────────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Imagen 3 generates ~1-2MB PNG images sent as base64 via submit-prompt.
    // Default maxHttpBufferSize is 1MB which silently disconnects the socket.
    maxHttpBufferSize: 10e6, // 10 MB
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Create Room ──────────────────────────────────────────────────────────
    socket.on('create-room', ({ playerName }) => {
      const room = createRoom(socket.id, playerName || 'Player 1');
      room.scores.set(socket.id, { total: 0, roundScores: [] });
      socket.join(room.code);
      socket.emit('room-created', { code: room.code, state: getRoomState(room) });
      console.log(`[Room] Created: ${room.code} by ${playerName}`);
    });

    // ── Join Room ────────────────────────────────────────────────────────────
    socket.on('join-room', ({ roomCode, playerName }) => {
      const code = roomCode ? roomCode.toUpperCase() : roomCode;
      const room = rooms.get(code);
      // #region agent log
      const fs=require('fs');try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:join-room',message:'join-room received',data:{roomCode,code,roomExists:!!room,socketId:socket.id,allRoomCodes:Array.from(rooms.keys())},timestamp:Date.now(),hypothesisId:'H-A,H-D,H-C'})+'\n');}catch(e){}
      // #endregion
      if (!room) { socket.emit('error', { message: 'Room not found!' }); return; }

      // Idempotent join: if this socket is already a player, just resync state.
      // This happens when the singleton socket navigates from landing → room page.
      if (room.players.has(socket.id)) {
        socket.join(code);
        socket.emit('room-joined', { code, state: getRoomState(room) });
        return;
      }

      if (room.phase !== 'lobby') { socket.emit('error', { message: 'Game already in progress!' }); return; }
      if (room.players.size >= 8) { socket.emit('error', { message: 'Room is full (8 players max)!' }); return; }

      room.players.set(socket.id, {
        id: socket.id,
        name: playerName || `Player ${room.players.size + 1}`,
        isReady: false,
        isHost: false,
        avatar: getAvatar(playerName || 'Player'),
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
      // #region agent log
      const fs=require('fs');try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:submit-prompt',message:'submit-prompt received',data:{roomCode,hasImage:!!imageData,imageDataLen:imageData?imageData.length:0,socketId:socket.id},timestamp:Date.now(),hypothesisId:'H-I5-size'})+'\n');}catch(e){}
      // #endregion
      const room = rooms.get(roomCode);
      if (!room || room.phase !== 'playing') return;
      if (room.submissions.has(socket.id)) return; // already submitted

      const submittedAt = Date.now();
      const submissionTimeMs = submittedAt - room.roundStartTime;
      // Apply any token drain that was cast on this player
      const drainedTokens = room.tokenDrains.get(socket.id) || 0;
      const effectiveBudget = Math.max(0, TOKEN_BUDGET - drainedTokens);
      const clampedTokensUsed = Math.min(tokensUsed, effectiveBudget);
      room.submissions.set(socket.id, { prompt, imageData, tokensUsed: clampedTokensUsed, submittedAt, submissionTimeMs });

      io.to(roomCode).emit('player-submitted', { playerId: socket.id, playerName: room.players.get(socket.id)?.name });
      io.to(roomCode).emit('room-update', getRoomState(room));

      // If all players submitted, move to scoring early
      if (room.submissions.size >= room.players.size) {
        clearTimeout(room.roundTimer);
        startScoring(io, room);
      }
    });

    // ── Use Powerup ──────────────────────────────────────────────────────────
    socket.on('use-powerup', ({ roomCode, powerupId, targetPlayerId }) => {
      const room = rooms.get(roomCode);
      if (!room || room.phase !== 'playing') return;

      const myPowerup = room.powerups.get(socket.id);
      if (!myPowerup || myPowerup !== powerupId) return; // doesn't own this powerup

      const used = room.usedPowerups.get(socket.id) || new Set();
      if (used.has(powerupId)) return; // already used
      used.add(powerupId);
      room.usedPowerups.set(socket.id, used);
      room.powerups.delete(socket.id); // consume the card

      const caster = room.players.get(socket.id);
      const casterName = caster?.name || 'Someone';

      switch (powerupId) {
        case 'TOKEN_DRAIN': {
          // Check if target has a shield
          if (room.shields.has(targetPlayerId)) {
            room.shields.delete(targetPlayerId);
            io.to(roomCode).emit('powerup-blocked', {
              casterId: socket.id, casterName,
              targetId: targetPlayerId,
              targetName: room.players.get(targetPlayerId)?.name,
              powerupId,
            });
          } else {
            const existing = room.tokenDrains.get(targetPlayerId) || 0;
            room.tokenDrains.set(targetPlayerId, existing + 20);
            const target = io.sockets.sockets.get(targetPlayerId);
            if (target) {
              target.emit('powerup-received', { powerupId: 'TOKEN_DRAIN', casterId: socket.id, casterName, amount: 20 });
            }
            io.to(roomCode).emit('powerup-used', { casterId: socket.id, casterName, powerupId, targetId: targetPlayerId, targetName: room.players.get(targetPlayerId)?.name });
          }
          break;
        }
        case 'FREEZE': {
          if (room.shields.has(targetPlayerId)) {
            room.shields.delete(targetPlayerId);
            io.to(roomCode).emit('powerup-blocked', {
              casterId: socket.id, casterName,
              targetId: targetPlayerId,
              targetName: room.players.get(targetPlayerId)?.name,
              powerupId,
            });
          } else {
            const target = io.sockets.sockets.get(targetPlayerId);
            if (target) {
              target.emit('powerup-received', { powerupId: 'FREEZE', casterId: socket.id, casterName, duration: 10 });
            }
            io.to(roomCode).emit('powerup-used', { casterId: socket.id, casterName, powerupId, targetId: targetPlayerId, targetName: room.players.get(targetPlayerId)?.name });
          }
          break;
        }
        case 'TOKEN_SHIELD': {
          room.shields.add(socket.id);
          socket.emit('powerup-self', { powerupId: 'TOKEN_SHIELD', message: 'Shield activated! You are protected from the next attack.' });
          io.to(roomCode).emit('powerup-used', { casterId: socket.id, casterName, powerupId });
          break;
        }
        case 'HINT': {
          const hints = IMAGE_HINTS[room.currentImageId] || ['detailed', 'vivid', 'artistic'];
          const picked = hints.sort(() => 0.5 - Math.random()).slice(0, 2);
          socket.emit('powerup-self', { powerupId: 'HINT', hints: picked });
          io.to(roomCode).emit('powerup-used', { casterId: socket.id, casterName, powerupId });
          break;
        }
        case 'DOUBLE_POINTS': {
          room.doublePoints.add(socket.id);
          socket.emit('powerup-self', { powerupId: 'DOUBLE_POINTS', message: 'Double Points activated! Your score this round will be doubled.' });
          io.to(roomCode).emit('powerup-used', { casterId: socket.id, casterName, powerupId });
          break;
        }
        case 'CATEGORY': {
          const img = REFERENCE_IMAGES.find(i => i.id === room.currentImageId);
          socket.emit('powerup-self', { powerupId: 'CATEGORY', category: img?.category || 'Unknown', difficulty: img?.difficulty || 'Unknown' });
          io.to(roomCode).emit('powerup-used', { casterId: socket.id, casterName, powerupId });
          break;
        }
        default:
          break;
      }

      io.to(roomCode).emit('room-update', getRoomState(room));
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} reason=${reason}`);
      // #region agent log
      const fs=require('fs');try{const playerRooms=[];rooms.forEach((r,c)=>{if(r.players.has(socket.id))playerRooms.push(c);});fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:disconnect',message:'socket disconnected',data:{socketId:socket.id,reason,playerInRooms:playerRooms},timestamp:Date.now(),hypothesisId:'H-I5'})+'\n');}catch(e){}
      // #endregion
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

    socket.on('play-again', ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socket.id) return;
      room.currentRound = 0;
      room.submissions.clear();
      room.roundResults = [];
      room.scores.forEach((s) => { s.total = 0; s.roundScores = []; });
      room.phase = 'lobby';
      room.players.forEach(p => { p.isReady = false; });
      room.powerups.clear();
      room.usedPowerups.clear();
      room.shields.clear();
      room.doublePoints.clear();
      room.frozenPlayers.forEach(handle => clearTimeout(handle));
      room.frozenPlayers.clear();
      room.tokenDrains.clear();
      io.to(roomCode).emit('room-update', getRoomState(room));
    });
  });

  function startNextRound(io, room) {
    room.currentRound++;
    room.phase = 'countdown';
    room.submissions.clear();
    room.roundResults = [];

    // Reset powerup state for new round
    room.shields.clear();
    room.frozenPlayers.forEach(handle => clearTimeout(handle));
    room.frozenPlayers.clear();
    room.tokenDrains.clear();
    room.usedPowerups.clear();

    // Deal one powerup per player
    const playerIds = Array.from(room.players.keys());
    const dealt = dealPowerups(playerIds);
    room.powerups = new Map(Object.entries(dealt));

    const usedIds = room.players.size > 0 ? [] : [];
    const image = getRandomImage(usedIds);
    room.currentImageId = image.id;

    io.to(room.code).emit('room-update', getRoomState(room));
    io.to(room.code).emit('game-start', {
      round: room.currentRound,
      totalRounds: room.totalRounds,
      image: { id: image.id, url: `/reference-images/${image.filename}`, category: image.category, difficulty: image.difficulty, title: image.title },
      tokenBudget: TOKEN_BUDGET,
      duration: ROUND_DURATION_MS,
    });

    // Countdown: tick 3 → 2 → 1 then start playing
    [3, 2, 1].forEach((val, i) => {
      setTimeout(() => {
        io.to(room.code).emit('countdown-tick', { value: val });
      }, i * 1000);
    });

    setTimeout(() => {
      room.phase = 'playing';
      room.roundStartTime = Date.now();
      io.to(room.code).emit('round-playing', { startTime: room.roundStartTime });
      io.to(room.code).emit('room-update', getRoomState(room));

      // Timer ticks every second
      let timeLeft = ROUND_DURATION_MS / 1000;
      const tickInterval = setInterval(() => {
        timeLeft--;
        io.to(room.code).emit('timer-tick', { timeLeft });
        if (timeLeft <= 0) clearInterval(tickInterval);
      }, 1000);

      // Auto-end round when time expires
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

    const currentImage = REFERENCE_IMAGES.find(img => img.id === room.currentImageId);
    const results = [];
    // #region agent log
    const fs=require('fs');try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:startScoring',message:'scoring started',data:{roomCode:room.code,submissions:room.submissions.size,currentImageId:room.currentImageId,imageExists:!!currentImage},timestamp:Date.now(),hypothesisId:'H-I1'})+'\n');}catch(e){}
    // #endregion

    for (const [playerId, submission] of room.submissions.entries()) {
      const player = room.players.get(playerId);
      if (!player) continue;

      let similarityScore = 0;
      let reasoning = 'No image submitted.';

      // #region agent log
      try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:scoring-loop',message:'scoring submission',data:{playerId,hasImageData:!!submission.imageData,imageDataLen:submission.imageData?submission.imageData.length:0,imageDataPrefix:submission.imageData?submission.imageData.substring(0,80):'none'},timestamp:Date.now(),hypothesisId:'H-I1,H-I2'})+'\n');}catch(e){}
      // #endregion

      if (submission.imageData) {
        try {
          // #region agent log
          try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:score-fetch-start',message:'calling score-image API',data:{url:`${NEXT_APP_URL}/api/score-image`,refImageId:room.currentImageId},timestamp:Date.now(),hypothesisId:'H-I1'})+'\n');}catch(e){}
          // #endregion
          const response = await fetch(`${NEXT_APP_URL}/api/score-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referenceImageId: room.currentImageId,
              generatedImageBase64: submission.imageData,
            }),
          });
          const data = await response.json();
          // #region agent log
          try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:score-fetch-done',message:'score-image API responded',data:{status:response.status,similarityScore:data.similarityScore,reasoning:data.reasoning?.substring(0,100),error:data.error},timestamp:Date.now(),hypothesisId:'H-I1'})+'\n');}catch(e){}
          // #endregion
          similarityScore = data.similarityScore ?? 0;
          reasoning = data.reasoning ?? '';
        } catch (err) {
          // #region agent log
          try{fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:score-fetch-error',message:'score-image API failed',data:{error:err?.message},timestamp:Date.now(),hypothesisId:'H-I1'})+'\n');}catch(e){}
          // #endregion
          console.error('[Scoring] Error:', err);
          similarityScore = 0;
        }
      }

      const baseScore = calculateScore({
        similarityScore,
        tokensUsed: submission.tokensUsed || 0,
        tokenBudget: TOKEN_BUDGET,
        submissionTimeMs: submission.submissionTimeMs || ROUND_DURATION_MS,
        roundDurationMs: ROUND_DURATION_MS,
      });

      const hasDoublePoints = room.doublePoints.has(playerId);
      const roundScore = hasDoublePoints ? baseScore * 2 : baseScore;
      if (hasDoublePoints) room.doublePoints.delete(playerId);

      const playerScore = room.scores.get(playerId);
      if (playerScore) {
        playerScore.roundScores.push(roundScore);
        playerScore.total += roundScore;
      }

      results.push({
        playerId,
        playerName: player.name,
        playerAvatar: player.avatar,
        prompt: submission.prompt,
        imageData: submission.imageData,
        tokensUsed: submission.tokensUsed,
        similarityScore,
        roundScore,
        reasoning,
      });
    }

    // Sort by round score and assign rank
    results.sort((a, b) => b.roundScore - a.roundScore);
    results.forEach((r, i) => { r.rank = i + 1; });
    room.roundResults = results;
    room.phase = 'reveal';
    // #region agent log
    try{const fs=require('fs');fs.appendFileSync('/Users/anindaghosh/Work/Projects/Columbia Hack/trendsiq-app/.cursor/debug-5dffed.log',JSON.stringify({sessionId:'5dffed',location:'server.js:results-ready-emit',message:'emitting results-ready',data:{resultCount:results.length,phase:room.phase,roomCode:room.code},timestamp:Date.now(),hypothesisId:'H-I1,H-I4'})+'\n');}catch(e){}
    // #endregion

    io.to(room.code).emit('room-update', getRoomState(room));
    io.to(room.code).emit('results-ready', {
      results,
      scores: Array.from(room.scores.entries()).map(([id, s]) => ({
        playerId: id,
        playerName: room.players.get(id)?.name,
        playerAvatar: room.players.get(id)?.avatar,
        total: s.total,
        roundScores: s.roundScores,
      })).sort((a, b) => b.total - a.total),
      isLastRound: room.currentRound >= room.totalRounds,
    });
  }

  function endGame(io, room) {
    room.phase = 'leaderboard';
    const leaderboard = Array.from(room.scores.entries()).map(([id, s]) => ({
      playerId: id,
      playerName: room.players.get(id)?.name,
      playerAvatar: room.players.get(id)?.avatar,
      avatar: room.players.get(id)?.avatar,
      totalScore: s.total,
      roundScores: s.roundScores,
    })).sort((a, b) => b.totalScore - a.totalScore)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    io.to(room.code).emit('game-over', { leaderboard, finalScores: leaderboard });
    io.to(room.code).emit('room-update', getRoomState(room));
  }

  httpServer.listen(port, () => {
    console.log(`\n🎮 Promptinary running at http://${hostname}:${port}\n`);
  });
});
