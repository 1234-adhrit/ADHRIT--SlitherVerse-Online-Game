# SlitherVerse Online

Multiplayer slither-style game with real-time rooms, lobby, chat, and solo mode. Runs locally at `http://localhost:3000/`.

**How To Run**
1. Open a terminal in `C:\Users\Administrator\OneDrive\Documents\CodeX[27]`.
2. Install dependencies: `npm install`
3. Start the server: `npm start`
4. Open `http://localhost:3000/` in your browser.

**How To Play**
- Enter your player name.
- Choose a skin color.
- Create a server, join a server, or play solo.
- Move by aiming your mouse (or touch).
- Boost with `Space`, `Shift`, mouse-hold, or touch-hold.
- Eat glowing food to grow and increase your score.
- Avoid crashing into other snakes. If you collide, you respawn.

**Multiplayer Rules**
- Each server allows 2 to 20 players.
- Servers start 60 seconds after creation when at least 2 players are present.
- Players can still join after a server has started using the server code.
- Chat is per-server and visible to everyone in that room.

**Solo Mode**
- Solo servers start immediately (no timer).
- A bot is added so the room meets the 2-player minimum.
- Choose bot difficulty with the slider (Easy, Normal, Hard).

**UI Features**
- Server board with live status and join buttons.
- Lobby panel with server code and countdown.
- Top-10 leaderboard.
- Minimap showing players and food.
- Ping indicator for network latency.
- Boost energy bar.

**How It Works (High Level)**
- `server.js` runs a Node + Express + Socket.IO server.
- Each room has its own player list, food, and chat.
- The server simulates snake movement and collisions at a fixed tick rate.
- Clients send direction and boost input; the server broadcasts authoritative game state.
- The client renders with canvas, including glowing snakes, food, and minimap.

**Troubleshooting**
- If the page is blank, confirm the server is running and visit `http://localhost:3000/`.
- If PowerShell blocks npm scripts, run with `cmd /c`:
  - `cmd /c "cd /d C:\Users\Administrator\OneDrive\Documents\CodeX[27] && npm start"`
 
## Play Online

- https://adhrit-slitherverse-online-game.onrender.com
