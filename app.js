const API_BASE =
  "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard";

const GRID_SIZE = 24;
const BASE_STEP_MS = 130;
const POWERUP_DURATION_MS = 6000;
const POWERUP_SPAWN_CHANCE = 0.18;
const SCORE_PER_FOOD = 10;

const POWERUPS = {
  double: { name: "2x Points", color: [1.0, 0.93, 0.35, 1.0] },
  slow: { name: "Slow-mo", color: [0.48, 0.78, 1.0, 1.0] },
  ghost: { name: "Ghost Mode", color: [0.9, 0.6, 1.0, 1.0] }
};

const COLORS = {
  board: [0.05, 0.09, 0.12, 1.0],
  grid: [0.12, 0.2, 0.25, 1.0],
  snakeBody: [0.0, 0.78, 0.55, 1.0],
  snakeHead: [0.45, 1.0, 0.77, 1.0],
  food: [1.0, 0.32, 0.38, 1.0]
};

const $ = (id) => document.getElementById(id);

const ui = {
  score: $("score"),
  highScore: $("highScore"),
  status: $("status"),
  power: $("power"),
  playerName: $("playerName"),
  submitBtn: $("submitBtn"),
  submitMessage: $("submitMessage"),
  leaderboardList: $("leaderboardList"),
  refreshBtn: $("refreshBtn"),
  restartBtn: $("restartBtn"),
  pauseBtn: $("pauseBtn")
};

const canvas = $("glCanvas");
const gl = canvas.getContext("webgl", { antialias: false });

if (!gl) {
  throw new Error("WebGL not supported in this browser.");
}

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform vec4 u_color;
  void main() {
    gl_FragColor = u_color;
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failure");
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  const v = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const f = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failure");
  }
  return program;
}

const program = createProgram();
const positionBuffer = gl.createBuffer();
const aPosition = gl.getAttribLocation(program, "a_position");
const uColor = gl.getUniformLocation(program, "u_color");

gl.useProgram(program);
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

function cellToClip(x, y) {
  const size = 2 / GRID_SIZE;
  const left = -1 + x * size;
  const right = left + size;
  const top = 1 - y * size;
  const bottom = top - size;
  return { left, right, top, bottom };
}

function drawRectCell(x, y, color, inset = 0) {
  const rect = cellToClip(x, y);
  const delta = (2 / GRID_SIZE) * inset;
  const left = rect.left + delta;
  const right = rect.right - delta;
  const top = rect.top - delta;
  const bottom = rect.bottom + delta;

  const vertices = new Float32Array([
    left,
    bottom,
    right,
    bottom,
    left,
    top,
    left,
    top,
    right,
    bottom,
    right,
    top
  ]);

  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
  gl.uniform4fv(uColor, color);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawBackground() {
  const verts = new Float32Array([
    -1,
    -1,
    1,
    -1,
    -1,
    1,
    -1,
    1,
    1,
    -1,
    1,
    1
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
  gl.uniform4fv(uColor, COLORS.board);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  for (let i = 1; i < GRID_SIZE; i += 1) {
    drawGridLineX(i);
    drawGridLineY(i);
  }
}

function drawGridLineX(col) {
  const size = 2 / GRID_SIZE;
  const x = -1 + col * size;
  const thickness = size * 0.03;
  const verts = new Float32Array([
    x - thickness,
    -1,
    x + thickness,
    -1,
    x - thickness,
    1,
    x - thickness,
    1,
    x + thickness,
    -1,
    x + thickness,
    1
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
  gl.uniform4fv(uColor, COLORS.grid);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawGridLineY(row) {
  const size = 2 / GRID_SIZE;
  const y = 1 - row * size;
  const thickness = size * 0.03;
  const verts = new Float32Array([
    -1,
    y - thickness,
    1,
    y - thickness,
    -1,
    y + thickness,
    -1,
    y + thickness,
    1,
    y - thickness,
    1,
    y + thickness
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
  gl.uniform4fv(uColor, COLORS.grid);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function randomCell() {
  return {
    x: Math.floor(Math.random() * GRID_SIZE),
    y: Math.floor(Math.random() * GRID_SIZE)
  };
}

function keyForCell(c) {
  return `${c.x},${c.y}`;
}

const game = {
  snake: [],
  direction: { x: 1, y: 0 },
  queuedDirection: { x: 1, y: 0 },
  food: null,
  powerup: null,
  activePower: null,
  activePowerUntil: 0,
  score: 0,
  highScore: 0,
  running: true,
  over: false,
  accumulator: 0,
  lastTimestamp: performance.now()
};

function resetGame() {
  game.snake = [
    { x: 7, y: 12 },
    { x: 6, y: 12 },
    { x: 5, y: 12 }
  ];
  game.direction = { x: 1, y: 0 };
  game.queuedDirection = { x: 1, y: 0 };
  game.food = spawnEmptyCell();
  game.powerup = null;
  game.activePower = null;
  game.activePowerUntil = 0;
  game.score = 0;
  game.running = true;
  game.over = false;
  game.accumulator = 0;
  ui.status.textContent = "Running";
  ui.power.textContent = "None";
  ui.pauseBtn.textContent = "Pause";
  syncScore();
}

function spawnEmptyCell() {
  const occupied = new Set(game.snake.map(keyForCell));
  if (game.food) occupied.add(keyForCell(game.food));
  if (game.powerup) occupied.add(keyForCell(game.powerup));

  let cell = randomCell();
  while (occupied.has(keyForCell(cell))) {
    cell = randomCell();
  }
  return cell;
}

function maybeSpawnPowerup() {
  if (game.powerup || Math.random() > POWERUP_SPAWN_CHANCE) {
    return;
  }

  const types = Object.keys(POWERUPS);
  const type = types[Math.floor(Math.random() * types.length)];
  game.powerup = { ...spawnEmptyCell(), type };
}

function activatePower(type) {
  game.activePower = type;
  game.activePowerUntil = performance.now() + POWERUP_DURATION_MS;
  ui.power.textContent = POWERUPS[type].name;
}

function clearPowerIfExpired(now) {
  if (game.activePower && now >= game.activePowerUntil) {
    game.activePower = null;
    game.activePowerUntil = 0;
    ui.power.textContent = "None";
  }
}

function currentStepMs() {
  return game.activePower === "slow" ? BASE_STEP_MS * 1.8 : BASE_STEP_MS;
}

function wrapOrBlock(value) {
  if (value >= GRID_SIZE) return 0;
  if (value < 0) return GRID_SIZE - 1;
  return value;
}

function tick(now) {
  clearPowerIfExpired(now);

  if (!game.running || game.over) {
    return;
  }

  game.direction = game.queuedDirection;
  const head = game.snake[0];
  let nx = head.x + game.direction.x;
  let ny = head.y + game.direction.y;

  if (game.activePower === "ghost") {
    nx = wrapOrBlock(nx);
    ny = wrapOrBlock(ny);
  } else if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) {
    endGame();
    return;
  }

  const nextHead = { x: nx, y: ny };
  const willEatFood = nextHead.x === game.food.x && nextHead.y === game.food.y;
  const collisionBody = willEatFood ? game.snake : game.snake.slice(0, -1);
  if (collisionBody.some((part) => part.x === nextHead.x && part.y === nextHead.y)) {
    endGame();
    return;
  }

  game.snake.unshift(nextHead);
  let grew = false;

  if (willEatFood) {
    const multi = game.activePower === "double" ? 2 : 1;
    game.score += SCORE_PER_FOOD * multi;
    game.highScore = Math.max(game.highScore, game.score);
    game.food = spawnEmptyCell();
    maybeSpawnPowerup();
    grew = true;
    syncScore();
  }

  if (game.powerup && nextHead.x === game.powerup.x && nextHead.y === game.powerup.y) {
    activatePower(game.powerup.type);
    game.powerup = null;
  }

  if (!grew) {
    game.snake.pop();
  }
}

function endGame() {
  game.over = true;
  game.running = false;
  ui.status.textContent = "Game Over";
  ui.pauseBtn.textContent = "Pause";
  ui.submitMessage.textContent = "Game over. Submit your score to leaderboard.";
}

function syncScore() {
  ui.score.textContent = `${game.score}`;
  ui.highScore.textContent = `${game.highScore}`;
}

function render() {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  drawBackground();

  if (game.food) {
    drawRectCell(game.food.x, game.food.y, COLORS.food, 0.12);
  }

  if (game.powerup) {
    drawRectCell(game.powerup.x, game.powerup.y, POWERUPS[game.powerup.type].color, 0.18);
  }

  game.snake.forEach((cell, idx) => {
    drawRectCell(cell.x, cell.y, idx === 0 ? COLORS.snakeHead : COLORS.snakeBody, 0.08);
  });
}

function frame(timestamp) {
  const dt = timestamp - game.lastTimestamp;
  game.lastTimestamp = timestamp;
  game.accumulator += dt;

  const step = currentStepMs();
  while (game.accumulator >= step) {
    game.accumulator -= step;
    tick(timestamp);
  }

  render();
  requestAnimationFrame(frame);
}

function setDirection(x, y) {
  if (!game.running && !game.over) {
    return;
  }
  if (game.direction.x === -x && game.direction.y === -y) {
    return;
  }
  game.queuedDirection = { x, y };
}

document.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case "arrowup":
    case "w":
      setDirection(0, -1);
      break;
    case "arrowdown":
    case "s":
      setDirection(0, 1);
      break;
    case "arrowleft":
    case "a":
      setDirection(-1, 0);
      break;
    case "arrowright":
    case "d":
      setDirection(1, 0);
      break;
    case " ":
      togglePause();
      break;
    default:
      return;
  }
  e.preventDefault();
});

function togglePause() {
  if (game.over) {
    return;
  }
  game.running = !game.running;
  ui.status.textContent = game.running ? "Running" : "Paused";
  ui.pauseBtn.textContent = game.running ? "Pause" : "Resume";
}

ui.pauseBtn.addEventListener("click", togglePause);
ui.restartBtn.addEventListener("click", () => {
  resetGame();
});

async function fetchLeaderboard() {
  ui.leaderboardList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = "Loading...";
  ui.leaderboardList.appendChild(li);

  try {
    const res = await fetch(`${API_BASE}.json`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = (await res.json()) || {};
    const rows = Object.entries(data)
      .map(([name, entry]) => ({
        name,
        score: Number(entry?.score) || 0,
        language: entry?.language || "",
        difficulty: entry?.difficulty || "",
        timestamp: Number(entry?.timestamp) || 0
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.timestamp - a.timestamp;
      })
      .slice(0, 10);

    ui.leaderboardList.innerHTML = "";
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.textContent = "No scores yet.";
      ui.leaderboardList.appendChild(empty);
      return;
    }

    rows.forEach((row, index) => {
      const item = document.createElement("li");
      item.className = "board-row";
      item.innerHTML = `<span class="board-name">${index + 1}. ${escapeHtml(row.name)} (${escapeHtml(
        row.language
      )})</span><span class="board-score">${row.score}</span>`;
      ui.leaderboardList.appendChild(item);
    });
  } catch (err) {
    ui.leaderboardList.innerHTML = `<li class="error">Failed to load leaderboard: ${escapeHtml(
      err.message
    )}</li>`;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function submitScore() {
  const name = ui.playerName.value.trim();
  if (!name) {
    ui.submitMessage.textContent = "Enter player name first.";
    ui.submitMessage.classList.add("error");
    return;
  }

  ui.submitMessage.classList.remove("error");
  ui.submitMessage.textContent = "Checking existing score...";

  const safeName = encodeURIComponent(name);
  const playerUrl = `${API_BASE}/${safeName}.json`;

  try {
    const currentRes = await fetch(playerUrl);
    if (!currentRes.ok) {
      throw new Error(`HTTP ${currentRes.status}`);
    }
    const current = await currentRes.json();
    const currentScore = Number(current?.score) || 0;

    if (current && game.score <= currentScore) {
      ui.submitMessage.textContent = `Not submitted. Existing best (${currentScore}) is higher or equal.`;
      return;
    }

    ui.submitMessage.textContent = "Submitting score...";
    const body = {
      score: game.score,
      timestamp: Math.floor(Date.now() / 1000),
      difficulty: "3D",
      language: "JavaScript"
    };

    const putRes = await fetch(playerUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      throw new Error(`HTTP ${putRes.status}`);
    }

    ui.submitMessage.textContent = "Score submitted.";
    await fetchLeaderboard();
  } catch (err) {
    ui.submitMessage.classList.add("error");
    ui.submitMessage.textContent = `Submit failed: ${err.message}`;
  }
}

ui.submitBtn.addEventListener("click", submitScore);
ui.refreshBtn.addEventListener("click", fetchLeaderboard);

resetGame();
fetchLeaderboard();
setInterval(fetchLeaderboard, 15000);
requestAnimationFrame(frame);
