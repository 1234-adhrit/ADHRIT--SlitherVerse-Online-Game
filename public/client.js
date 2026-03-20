const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menuEl = document.getElementById("menu");
const lobbyEl = document.getElementById("lobby");
const hudEl = document.getElementById("hud");
const nameInput = document.getElementById("nameInput");
const serverNameInput = document.getElementById("serverNameInput");
const maxPlayersInput = document.getElementById("maxPlayersInput");
const joinCodeInput = document.getElementById("joinCodeInput");
const serverListEl = document.getElementById("serverList");
const lobbyCodeEl = document.getElementById("lobbyCode");
const lobbyStatusEl = document.getElementById("lobbyStatus");
const lobbyTimerEl = document.getElementById("lobbyTimer");
const lobbyHintEl = document.getElementById("lobbyHint");
const playerListEl = document.getElementById("playerList");
const scoreboardEl = document.getElementById("scoreboard");
const chatMessagesEl = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const toastEl = document.getElementById("toast");
const skinRowEl = document.getElementById("skinRow");
const botDifficultyInput = document.getElementById("botDifficulty");
const botDifficultyLabel = document.getElementById("botDifficultyLabel");
const pingValueEl = document.getElementById("pingValue");
const energyFillEl = document.getElementById("energyFill");
const energyTextEl = document.getElementById("energyText");
const minimapCanvas = document.getElementById("minimap");
const minimapCtx = minimapCanvas.getContext("2d");

let myId = null;
let currentRoom = null;
let latestRoom = null;
let desiredDir = 0;
let isBoosting = false;
let selectedColor = null;

const SKIN_COLORS = [
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

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function renderSkins() {
  skinRowEl.innerHTML = "";
  SKIN_COLORS.forEach((color, index) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "skin-swatch";
    swatch.style.background = color;
    if (index === 0) {
      swatch.classList.add("selected");
      selectedColor = color;
    }
    swatch.addEventListener("click", () => {
      selectedColor = color;
      document.querySelectorAll(".skin-swatch").forEach((el) => el.classList.remove("selected"));
      swatch.classList.add("selected");
    });
    skinRowEl.appendChild(swatch);
  });
}

function updateDifficultyLabel() {
  const value = Number(botDifficultyInput.value);
  const labels = { 1: "Easy", 2: "Normal", 3: "Hard" };
  botDifficultyLabel.textContent = labels[value] || "Normal";
}

renderSkins();
updateDifficultyLabel();
botDifficultyInput.addEventListener("input", updateDifficultyLabel);

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 2800);
}

function getPlayerName() {
  const name = nameInput.value.trim();
  if (!name) {
    showToast("Enter a player name first.");
    return null;
  }
  return name.slice(0, 16);
}

function updateView() {
  if (!currentRoom) {
    menuEl.classList.remove("hidden");
    lobbyEl.classList.add("hidden");
    hudEl.classList.remove("hidden");
    chatInput.disabled = true;
    document.getElementById("chatSend").disabled = true;
    chatInput.placeholder = "Join a server to chat";
    pingValueEl.textContent = "--";
    energyFillEl.style.width = "0%";
    energyTextEl.textContent = "BOOST 0%";
    scoreboardEl.innerHTML = "";
    return;
  }
  menuEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  chatInput.disabled = false;
  document.getElementById("chatSend").disabled = false;
  chatInput.placeholder = "Say hello...";
  if (latestRoom && latestRoom.started) {
    lobbyEl.classList.add("hidden");
  } else {
    lobbyEl.classList.remove("hidden");
  }
}

function renderServerList(list) {
  serverListEl.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.textContent = "No servers yet. Create one!";
    empty.style.color = "rgba(229,239,255,0.6)";
    serverListEl.appendChild(empty);
    return;
  }
  list.forEach((room) => {
    const card = document.createElement("div");
    card.className = "server-card";
    const status = room.started ? "Live" : room.timeLeft > 0 ? `${room.timeLeft}s` : "Waiting";
    card.innerHTML = `
      <h4>${room.name}</h4>
      <div class="server-meta">
        <span>Code: ${room.code}</span>
        <span>${status}</span>
      </div>
      <div class="server-meta">
        <span>Players: ${room.players}/${room.maxPlayers}</span>
        <span>${room.started ? "In Game" : "Lobby"}</span>
      </div>
    `;
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join";
    joinBtn.disabled = room.players >= room.maxPlayers;
    joinBtn.addEventListener("click", () => {
      joinCodeInput.value = room.code;
      handleJoin();
    });
    card.appendChild(joinBtn);
    serverListEl.appendChild(card);
  });
}

function updateLobby(room) {
  lobbyCodeEl.textContent = room.code || "-----";
  if (room.started) {
    lobbyStatusEl.textContent = "In Progress";
    lobbyStatusEl.style.color = "var(--success)";
    lobbyTimerEl.textContent = "Live";
    lobbyHintEl.textContent = "Game in progress. Jump in!";
  } else {
    lobbyStatusEl.textContent = "Waiting";
    lobbyStatusEl.style.color = "var(--accent)";
    const totalPlayers = room.players.length;
    if (room.timeLeft > 0) {
      lobbyTimerEl.textContent = `${room.timeLeft}s`;
      lobbyHintEl.textContent = "Server warming up. Invite more players!";
    } else if (totalPlayers < 2) {
      lobbyTimerEl.textContent = "Hold";
      lobbyHintEl.textContent = "Need at least 2 players to start.";
    } else {
      lobbyTimerEl.textContent = "Starting";
      lobbyHintEl.textContent = "Launching...";
    }
  }

  playerListEl.innerHTML = "";
  room.players.forEach((player) => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    pill.style.border = `1px solid ${player.color}55`;
    pill.textContent = `${player.name}${player.isBot ? " (Bot)" : ""}`;
    playerListEl.appendChild(pill);
  });
}

function updateScoreboard(room) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score).slice(0, 10);
  scoreboardEl.innerHTML = "";
  sorted.forEach((player, index) => {
    const row = document.createElement("div");
    row.textContent = `${index + 1}. ${player.name} — ${player.score}`;
    row.style.color = player.color;
    scoreboardEl.appendChild(row);
  });
}

function updateEnergy(room) {
  const me = room.players.find((player) => player.id === myId);
  if (!me) return;
  const energy = Math.max(0, Math.min(100, Math.round(me.boostEnergy || 0)));
  energyFillEl.style.width = `${energy}%`;
  energyTextEl.textContent = `BOOST ${energy}%`;
}

function appendChat({ name, message, system }) {
  const entry = document.createElement("div");
  entry.className = "chat-message";
  if (system) {
    entry.innerHTML = `<em>${message}</em>`;
  } else {
    entry.innerHTML = `<strong>${name}:</strong> ${message}`;
  }
  chatMessagesEl.appendChild(entry);
  while (chatMessagesEl.children.length > 60) {
    chatMessagesEl.removeChild(chatMessagesEl.firstChild);
  }
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function handleJoin() {
  const name = getPlayerName();
  if (!name) return;
  socket.emit("room:join", { code: joinCodeInput.value, playerName: name, color: selectedColor });
}

document.getElementById("soloBtn").addEventListener("click", () => {
  const name = getPlayerName();
  if (!name) return;
  socket.emit("room:solo", {
    playerName: name,
    color: selectedColor,
    difficulty: Number(botDifficultyInput.value || 2),
  });
});

document.getElementById("createBtn").addEventListener("click", () => {
  const name = getPlayerName();
  if (!name) return;
  socket.emit("room:create", {
    name: serverNameInput.value.trim(),
    maxPlayers: Number(maxPlayersInput.value || 10),
    playerName: name,
    color: selectedColor,
  });
});

document.getElementById("joinBtn").addEventListener("click", handleJoin);
document.getElementById("refreshBtn").addEventListener("click", () => socket.emit("lobby:list"));
document.getElementById("leaveBtn").addEventListener("click", () => window.location.reload());

document.getElementById("chatSend").addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat:send", { message: text });
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("chatSend").click();
  }
});

canvas.addEventListener("mousemove", (event) => {
  const dx = event.clientX - window.innerWidth / 2;
  const dy = event.clientY - window.innerHeight / 2;
  desiredDir = Math.atan2(dy, dx);
});

canvas.addEventListener("mousedown", () => {
  isBoosting = true;
});

window.addEventListener("mouseup", () => {
  isBoosting = false;
});

canvas.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - window.innerWidth / 2;
    const dy = touch.clientY - window.innerHeight / 2;
    desiredDir = Math.atan2(dy, dx);
    event.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchstart",
  () => {
    isBoosting = true;
  },
  { passive: true }
);

canvas.addEventListener(
  "touchend",
  () => {
    isBoosting = false;
  },
  { passive: true }
);

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key === " " || event.key === "Shift") {
    isBoosting = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === " " || event.key === "Shift") {
    isBoosting = false;
  }
});

setInterval(() => {
  if (!currentRoom) return;
  socket.emit("input:dir", { dir: desiredDir, boost: isBoosting });
}, 50);

socket.on("connect", () => {
  myId = socket.id;
  socket.emit("lobby:list");
});

socket.on("lobby:update", (list) => {
  renderServerList(list);
});

socket.on("room:joined", (room) => {
  currentRoom = room;
  latestRoom = room;
  updateView();
  updateLobby(room);
  updateScoreboard(room);
  updateEnergy(room);
});

socket.on("room:update", (room) => {
  if (!currentRoom) return;
  latestRoom = room;
  updateView();
  updateLobby(room);
  updateScoreboard(room);
  updateEnergy(room);
});

socket.on("room:error", (err) => {
  showToast(err.message || "Something went wrong.");
});

socket.on("chat:message", (payload) => appendChat(payload));
socket.on("room:notice", (payload) => appendChat({ name: "System", message: payload.message, system: true }));

socket.on("pong:check", (payload) => {
  if (!payload || typeof payload.t !== "number") return;
  pingValueEl.textContent = Math.round(Date.now() - payload.t);
});

setInterval(() => {
  if (!socket.connected) return;
  socket.emit("ping:check", { t: Date.now() });
}, 1500);

function drawGrid(camera, width, height) {
  const gridSize = 120;
  const offsetX = ((camera.x % gridSize) + gridSize) % gridSize;
  const offsetY = ((camera.y % gridSize) + gridSize) % gridSize;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = -offsetX; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = -offsetY; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

function drawFoods(foods, camera, width, height) {
  foods.forEach((food) => {
    const x = food.x - camera.x + width / 2;
    const y = food.y - camera.y + height / 2;
    if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;
    const hue = hashString(food.id || "0");
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.9)`;
    ctx.shadowBlur = 14;
    ctx.shadowColor = `hsla(${hue}, 80%, 70%, 0.8)`;
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawSnake(player, camera, width, height) {
  const segments = player.segments || [];
  if (!segments.length) return;
  const step = Math.max(1, Math.floor(segments.length / 180));
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = player.color;
  ctx.lineWidth = 16;
  ctx.shadowBlur = 18;
  ctx.shadowColor = player.color;
  ctx.beginPath();
  segments.forEach((seg, index) => {
    if (index % step !== 0) return;
    const x = seg.x - camera.x + width / 2;
    const y = seg.y - camera.y + height / 2;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const head = segments[0];
  const headX = head.x - camera.x + width / 2;
  const headY = head.y - camera.y + height / 2;
  const gradient = ctx.createRadialGradient(headX, headY, 4, headX, headY, 16);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.4, player.color);
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.shadowBlur = 20;
  ctx.shadowColor = player.color;
  ctx.beginPath();
  ctx.arc(headX, headY, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.font = "12px Sora, sans-serif";
  ctx.fillStyle = "rgba(229,239,255,0.9)";
  const textWidth = ctx.measureText(player.name).width;
  ctx.fillText(player.name, headX - textWidth / 2, headY - 18);
  ctx.restore();
}

function drawMinimap(room) {
  const size = minimapCanvas.width;
  minimapCtx.clearRect(0, 0, size, size);
  minimapCtx.fillStyle = "rgba(7, 12, 24, 0.9)";
  minimapCtx.fillRect(0, 0, size, size);
  const scale = size / room.worldSize;
  minimapCtx.fillStyle = "rgba(255,255,255,0.08)";
  room.foods.forEach((food) => {
    minimapCtx.fillRect(food.x * scale, food.y * scale, 2, 2);
  });
  room.players.forEach((player) => {
    const head = player.segments[0];
    if (!head) return;
    const x = head.x * scale;
    const y = head.y * scale;
    minimapCtx.fillStyle = player.color;
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, player.id === myId ? 4 : 3, 0, Math.PI * 2);
    minimapCtx.fill();
    if (player.id === myId) {
      minimapCtx.strokeStyle = "#ffffff";
      minimapCtx.lineWidth = 1;
      minimapCtx.stroke();
    }
  });
}

function render() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);
  if (!latestRoom) {
    requestAnimationFrame(render);
    return;
  }
  const me = latestRoom.players.find((player) => player.id === myId);
  const camera = me && me.segments.length ? me.segments[0] : { x: latestRoom.worldSize / 2, y: latestRoom.worldSize / 2 };

  drawGrid(camera, width, height);
  drawFoods(latestRoom.foods, camera, width, height);
  latestRoom.players.forEach((player) => drawSnake(player, camera, width, height));
  drawMinimap(latestRoom);

  requestAnimationFrame(render);
}

render();
