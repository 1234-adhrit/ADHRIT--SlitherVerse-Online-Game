const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROOM_START_DELAY_MS = 60 * 1000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;
const WORLD_SIZE = 2400;
const WORLD_MARGIN = 20;
const FOOD_COUNT = 220;
const TICK_RATE = 20;
const START_LENGTH = 42;
const SEGMENT_SPACING = 6;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const BASE_SPEED = 170;
const BOOST_SPEED = 260;
const BOOST_DRAIN_PER_SEC = 28;
const BOOST_REGEN_PER_SEC = 18;
const BOT_DIFFICULTY_MIN = 1;
const BOT_DIFFICULTY_MAX = 3;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (rooms.has(code)) return makeRoomCode();
  return code;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomPos() {
  return {
    x: Math.random() * WORLD_SIZE,
    y: Math.random() * WORLD_SIZE,
  };
}

function lerpAngle(a, b, t) {
  let delta = b - a;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function createPlayer(name, isBot = false, options = {}) {
  const colors = [
    "#6BF2D9",
    "#F7B267",
    "#F25F5C",
    "#70C1B3",
    "#B388EB",
    "#5FA8D3",
    "#FFD166",
    "#FF70A6",
    "#7AE582",
    "#F9C784",
  ];
  const pos = randomPos();
  const dir = Math.random() * Math.PI * 2;
  const baseSpeed = options.baseSpeed || BASE_SPEED;
  const boostSpeed = options.boostSpeed || BOOST_SPEED;
  const selectedColor = colors.includes(options.color) ? options.color : null;
  return {
    id: isBot ? `bot_${Math.random().toString(36).slice(2, 9)}` : null,
    name,
    color: selectedColor || colors[Math.floor(Math.random() * colors.length)],
    isBot,
    x: pos.x,
    y: pos.y,
    dir,
    targetDir: dir,
    baseSpeed,
    boostSpeed,
    boosting: false,
    boostEnergy: 100,
    length: START_LENGTH,
    segments: [],
    score: 0,
    nextTurnAt: Date.now() + 800,
  };
}

function respawnSnake(room, player) {
  const pos = randomPos();
  player.x = pos.x;
  player.y = pos.y;
  player.dir = Math.random() * Math.PI * 2;
  player.targetDir = player.dir;
  player.length = START_LENGTH;
  player.invincibleUntil = Date.now() + 2500;
  player.boostEnergy = 100;
  player.boosting = false;
  player.segments = [];
  const dx = Math.cos(player.dir);
  const dy = Math.sin(player.dir);
  for (let i = 0; i < player.length; i += 1) {
    const segX = clamp(player.x - dx * SEGMENT_SPACING * i, WORLD_MARGIN, WORLD_SIZE - WORLD_MARGIN);
    const segY = clamp(player.y - dy * SEGMENT_SPACING * i, WORLD_MARGIN, WORLD_SIZE - WORLD_MARGIN);
    player.segments.push({ x: segX, y: segY });
  }
}

function ensureFood(room) {
  while (room.foods.length < FOOD_COUNT) {
    const pos = randomPos();
    room.foods.push({
      id: Math.random().toString(36).slice(2, 9),
      x: pos.x,
      y: pos.y,
      value: 1,
    });
  }
}

function createRoom({ name, maxPlayers, isSolo, difficulty }) {
  const code = makeRoomCode();
  const now = Date.now();
  const botDifficulty = clamp(Number(difficulty) || 2, BOT_DIFFICULTY_MIN, BOT_DIFFICULTY_MAX);
  const room = {
    id: code,
    name: name || `Room ${code}`,
    maxPlayers: clamp(maxPlayers || 10, MIN_PLAYERS, MAX_PLAYERS),
    createdAt: now,
    startAt: isSolo ? now : now + ROOM_START_DELAY_MS,
    started: Boolean(isSolo),
    isSolo: Boolean(isSolo),
    emptyAt: null,
    botDifficulty,
    players: new Map(),
    bots: new Map(),
    foods: [],
  };
  rooms.set(code, room);
  ensureFood(room);
  if (isSolo) {
    const baseSpeed = 140 + botDifficulty * 20;
    const bot = createPlayer("Bot", true, {
      baseSpeed,
      boostSpeed: baseSpeed + 80,
    });
    respawnSnake(room, bot);
    room.bots.set(bot.id, bot);
  }
  return room;
}

function addHumanToRoom(room, socket, playerName, color) {
  const player = createPlayer(playerName, false, { color });
  player.id = socket.id;
  respawnSnake(room, player);
  room.players.set(socket.id, player);
  room.emptyAt = null;
  socket.data.roomId = room.id;
  socket.join(room.id);
  return player;
}

function removeHumanFromRoom(room, socketId) {
  room.players.delete(socketId);
}

function getLobbySummary() {
  const now = Date.now();
  const list = [];
  for (const room of rooms.values()) {
    const totalPlayers = room.players.size + room.bots.size;
    const timeLeft = Math.max(0, Math.ceil((room.startAt - now) / 1000));
    list.push({
      code: room.id,
      name: room.name,
      players: totalPlayers,
      humans: room.players.size,
      maxPlayers: room.maxPlayers,
      started: room.started,
      timeLeft,
    });
  }
  return list;
}

function broadcastLobby() {
  io.emit("lobby:update", getLobbySummary());
}

function maybeStartRoom(room) {
  if (room.started) return;
  if (Date.now() < room.startAt) return;
  const totalPlayers = room.players.size + room.bots.size;
  if (totalPlayers < MIN_PLAYERS) return;
  room.started = true;
  io.to(room.id).emit("room:notice", {
    message: `Server started! Share code: ${room.id}`,
  });
}

function updateBots(room) {
  const now = Date.now();
  const difficulty = room.botDifficulty || 2;
  const jitter = 0.35 - (difficulty - 1) * 0.08;
  const delayBase = 900 - (difficulty - 1) * 200;
  const delayRand = 450 - (difficulty - 1) * 80;
  for (const bot of room.bots.values()) {
    if (now < bot.nextTurnAt) continue;
    let target = room.foods[0];
    let bestDist = Infinity;
    for (const food of room.foods) {
      const dx = food.x - bot.x;
      const dy = food.y - bot.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        target = food;
      }
    }
    const angle = Math.atan2(target.y - bot.y, target.x - bot.x);
    bot.targetDir = angle + (Math.random() - 0.5) * jitter;
    bot.nextTurnAt = now + delayBase + Math.random() * delayRand;
  }
}

function stepSnake(player, dt) {
  const canBoost = player.boosting && player.boostEnergy > 0;
  const speed = canBoost ? player.boostSpeed : player.baseSpeed;
  if (canBoost) {
    player.boostEnergy = Math.max(0, player.boostEnergy - BOOST_DRAIN_PER_SEC * dt);
  } else {
    player.boostEnergy = Math.min(100, player.boostEnergy + BOOST_REGEN_PER_SEC * dt);
  }
  player.dir = lerpAngle(player.dir, player.targetDir, 0.18);
  const nextX = player.x + Math.cos(player.dir) * speed * dt;
  const nextY = player.y + Math.sin(player.dir) * speed * dt;
  player.x = clamp(nextX, WORLD_MARGIN, WORLD_SIZE - WORLD_MARGIN);
  player.y = clamp(nextY, WORLD_MARGIN, WORLD_SIZE - WORLD_MARGIN);
  player.segments.unshift({ x: player.x, y: player.y });
  while (player.segments.length > Math.floor(player.length)) {
    player.segments.pop();
  }
}

function handleFood(room) {
  const eatRadius = 14;
  const eatRadiusSq = eatRadius * eatRadius;
  for (const snake of [...room.players.values(), ...room.bots.values()]) {
    for (let i = room.foods.length - 1; i >= 0; i -= 1) {
      const food = room.foods[i];
      const dx = food.x - snake.x;
      const dy = food.y - snake.y;
      if (dx * dx + dy * dy < eatRadiusSq) {
        room.foods.splice(i, 1);
        snake.length += 3;
        snake.score += 1;
      }
    }
  }
  ensureFood(room);
}

function handleCollisions(room) {
  const killRadius = 7;
  const killRadiusSq = killRadius * killRadius;
  const snakes = [...room.players.values(), ...room.bots.values()];
  for (const snake of snakes) {
    const head = snake.segments[0];
    if (!head) continue;
    if (snake.invincibleUntil && Date.now() < snake.invincibleUntil) continue;
    let hit = false;
    for (const other of snakes) {
      if (other.invincibleUntil && Date.now() < other.invincibleUntil) {
        continue;
      }
      const startIndex = snake === other ? 10 : 4;
      for (let i = startIndex; i < other.segments.length; i += 1) {
        const seg = other.segments[i];
        const dx = seg.x - head.x;
        const dy = seg.y - head.y;
        if (dx * dx + dy * dy < killRadiusSq) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) {
      dropSnake(room, snake);
      respawnSnake(room, snake);
    }
  }
}

function dropSnake(room, snake) {
  for (let i = 0; i < snake.segments.length; i += 4) {
    const seg = snake.segments[i];
    room.foods.push({
      id: Math.random().toString(36).slice(2, 9),
      x: seg.x,
      y: seg.y,
      value: 1,
    });
  }
  snake.score = 0;
}

function serializeRoom(room) {
  return {
    code: room.id,
    name: room.name,
    started: room.started,
    timeLeft: Math.max(0, Math.ceil((room.startAt - Date.now()) / 1000)),
    players: [...room.players.values(), ...room.bots.values()].map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      segments: player.segments,
      score: player.score,
      isBot: player.isBot,
      boostEnergy: player.boostEnergy,
    })),
    foods: room.foods,
    worldSize: WORLD_SIZE,
  };
}

function tickRooms() {
  const dt = 1 / TICK_RATE;
  for (const room of rooms.values()) {
    maybeStartRoom(room);
    if (!room.started) continue;
    updateBots(room);
    for (const player of room.players.values()) {
      stepSnake(player, dt);
    }
    for (const bot of room.bots.values()) {
      stepSnake(bot, dt);
    }
    handleFood(room);
    handleCollisions(room);
  }
}

function broadcastRooms() {
  for (const room of rooms.values()) {
    io.to(room.id).emit("room:update", serializeRoom(room));
  }
}

setInterval(() => {
  tickRooms();
  broadcastRooms();
}, 1000 / TICK_RATE);

setInterval(() => {
  broadcastLobby();
}, 1000);

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.isSolo) continue;
    if (room.players.size > 0) continue;
    if (!room.emptyAt) continue;
    if (now - room.emptyAt > EMPTY_ROOM_TTL_MS) {
      rooms.delete(room.id);
    }
  }
}, 30000);

io.on("connection", (socket) => {
  socket.emit("lobby:update", getLobbySummary());

  socket.on("lobby:list", () => {
    socket.emit("lobby:update", getLobbySummary());
  });

  socket.on("ping:check", (payload) => {
    socket.emit("pong:check", payload);
  });

  socket.on("room:create", ({ name, maxPlayers, playerName, color }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit("room:error", { message: "Please enter a name first." });
      return;
    }
    const room = createRoom({ name, maxPlayers });
    addHumanToRoom(room, socket, playerName.trim().slice(0, 16), color);
    socket.emit("room:joined", serializeRoom(room));
    broadcastLobby();
  });

  socket.on("room:solo", ({ playerName, color, difficulty }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit("room:error", { message: "Please enter a name first." });
      return;
    }
    const room = createRoom({
      name: "Solo Server",
      maxPlayers: 2,
      isSolo: true,
      difficulty,
    });
    addHumanToRoom(room, socket, playerName.trim().slice(0, 16), color);
    socket.emit("room:joined", serializeRoom(room));
    broadcastLobby();
  });

  socket.on("room:join", ({ code, playerName, color }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit("room:error", { message: "Please enter a name first." });
      return;
    }
    const roomCode = (code || "").toUpperCase().trim();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("room:error", { message: "Server code not found." });
      return;
    }
    const totalPlayers = room.players.size + room.bots.size;
    if (totalPlayers >= room.maxPlayers) {
      socket.emit("room:error", { message: "Server is full." });
      return;
    }
    addHumanToRoom(room, socket, playerName.trim().slice(0, 16), color);
    socket.emit("room:joined", serializeRoom(room));
    io.to(room.id).emit("room:notice", {
      message: `${playerName.trim().slice(0, 16)} joined the server.`,
    });
    broadcastLobby();
  });

  socket.on("input:dir", ({ dir, boost }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    if (typeof dir !== "number") return;
    player.targetDir = dir;
    player.boosting = Boolean(boost);
  });

  socket.on("chat:send", ({ message }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const clean = String(message || "").trim().slice(0, 200);
    if (!clean) return;
    io.to(room.id).emit("chat:message", {
      name: player.name,
      message: clean,
      at: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const leftPlayer = room.players.get(socket.id);
    removeHumanFromRoom(room, socket.id);
    if (room.players.size === 0) {
      if (room.isSolo) {
        rooms.delete(room.id);
      } else {
        room.emptyAt = Date.now();
      }
    } else {
      io.to(room.id).emit("room:notice", {
        message: leftPlayer ? `${leftPlayer.name} left the server.` : "A player left.",
      });
    }
    broadcastLobby();
  });
});

server.listen(PORT, () => {
  console.log(`Slither server running on http://localhost:${PORT}`);
});
