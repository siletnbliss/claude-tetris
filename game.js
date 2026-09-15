'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // Ring - pink
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Ring (3x3, hollow center)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const PIECE_WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 0.5]; // index 0 = type 1 ... index 7 = type 8 (Ring)

const THEME_KEY = 'tetris-theme';
const GRID_COLORS = { dark: '#22222e', light: '#d8dae8' };

const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';
const PASTEL_COLORS = [
  null, '#a8dee6', '#f5e6a3', '#d4a8dc', '#b8e0bb',
  '#f0b3b3', '#a8c8ee', '#f0cca3', '#f2b8cf',
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const pauseOverlay = document.getElementById('pause-overlay');
const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const startLevelSelect = document.getElementById('start-level-select');
const resumeBtn = document.getElementById('resume-btn');
const restartFromPauseBtn = document.getElementById('restart-from-pause-btn');
const viewControlsBtn = document.getElementById('view-controls-btn');
const backToPauseBtn = document.getElementById('back-to-pause-btn');
const skinSelect = document.getElementById('skin-select');
const highscoreListPanel = document.getElementById('highscore-list-panel');
const bestComboPanel = document.getElementById('best-combo-panel');
const maxLinesPanel = document.getElementById('max-lines-panel');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const nameEntryBox = document.getElementById('name-entry-box');
const nameInput = document.getElementById('name-input');
const submitNameBtn = document.getElementById('submit-name-btn');
const highScoreListGameOver = document.getElementById('highscore-list-gameover');
const comboStatGameOver = document.getElementById('best-combo-gameover');
const maxLinesStatGameOver = document.getElementById('max-lines-gameover');

let board, current, next, hold, holdUsed, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
let combo = 0;
let bestComboRun = 0;
let maxLinesRun = 0;

function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleBtn.addEventListener('click', () => {
  applyTheme(getTheme() === 'light' ? 'dark' : 'light');
  draw();
});

function dropIntervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function weightedPieceType() {
  const total = PIECE_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < PIECE_WEIGHTS.length; i++) {
    if (r < PIECE_WEIGHTS[i]) return i + 1;
    r -= PIECE_WEIGHTS[i];
  }
  return PIECE_WEIGHTS.length;
}

function pieceFromType(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return pieceFromType(weightedPieceType());
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared > 0) {
    combo++;
    if (combo > bestComboRun) bestComboRun = combo;
    if (cleared > maxLinesRun) maxLinesRun = cleared;
  } else {
    combo = 0;
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = dropIntervalForLevel(level);
    updateHUD();
  }
}

function loadHighScores() {
  try { return JSON.parse(localStorage.getItem('tetris-highscores')) || []; }
  catch { return []; }
}
function saveHighScores(list) {
  try { localStorage.setItem('tetris-highscores', JSON.stringify(list)); } catch {}
}
function loadBestCombo() { return parseInt(localStorage.getItem('tetris-best-combo'), 10) || 0; }
function loadMaxLines() { return parseInt(localStorage.getItem('tetris-max-lines'), 10) || 0; }
function updateAllTimeStats() {
  try {
    if (bestComboRun > loadBestCombo()) localStorage.setItem('tetris-best-combo', String(bestComboRun));
    if (maxLinesRun > loadMaxLines()) localStorage.setItem('tetris-max-lines', String(maxLinesRun));
  } catch {}
}
function qualifiesForHighScore(candidateScore) {
  const list = loadHighScores();
  return list.length < 5 || candidateScore > list[list.length - 1].score;
}
function addHighScoreTracked(name, finalScore) {
  const list = loadHighScores();
  const newEntry = { name, score: finalScore, lines, level, date: new Date().toISOString() };
  list.push(newEntry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, 5);
  saveHighScores(list);
  return { list, newEntry };
}
function renderHighScoreList(container, list, highlightEntry) {
  container.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sin puntuaciones aún';
    container.appendChild(li);
    return;
  }
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${entry.name} — ${entry.score.toLocaleString()}`;
    if (highlightEntry && entry === highlightEntry) li.classList.add('highscore-current');
    container.appendChild(li);
  });
}
function renderAllTimeStats(comboEl, maxLinesEl) {
  comboEl.textContent = loadBestCombo();
  maxLinesEl.textContent = loadMaxLines();
}
function resetHighScores() {
  try {
    localStorage.removeItem('tetris-highscores');
    localStorage.removeItem('tetris-best-combo');
    localStorage.removeItem('tetris-max-lines');
  } catch {}
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
  holdUsed = false;
  holdCanvas.classList.remove('locked');
}

function holdPiece() {
  if (holdUsed) return;
  if (hold === null) {
    hold = { type: current.type };
    spawn();
  } else {
    const swapType = hold.type;
    hold = { type: current.type };
    current = pieceFromType(swapType);
    if (collide(current.shape, current.x, current.y)) {
      endGame();
      return;
    }
  }
  holdUsed = true;
  holdCanvas.classList.add('locked');
  drawHold();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  switch (currentSkin) {
    case 'neon': drawBlockNeon(context, x, y, colorIndex, size, alpha); break;
    case 'pastel': drawBlockPastel(context, x, y, colorIndex, size, alpha); break;
    case 'pixel': drawBlockPixel(context, x, y, colorIndex, size, alpha); break;
    default: drawBlockRetro(context, x, y, colorIndex, size, alpha); break;
  }
}

function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.restore();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  context.globalAlpha = 1;
}

function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  const color = PASTEL_COLORS[colorIndex];
  const r = 6;
  const px = x * size + 1, py = y * size + 1, w = size - 2, h = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(px, py, w, h, r);
  } else {
    context.moveTo(px + r, py);
    context.arcTo(px + w, py, px + w, py + h, r);
    context.arcTo(px + w, py + h, px, py + h, r);
    context.arcTo(px, py + h, px, py, r);
    context.arcTo(px, py, px + w, py, r);
  }
  context.fill();
  context.globalAlpha = 1;
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  const px = x * size + 1, py = y * size + 1, w = size - 2, h = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, w, h);
  const cell = Math.max(2, Math.floor(size / 6));
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = 0; xx < w; xx += cell) {
      if (((xx / cell) + (yy / cell)) % 2 === 0) {
        context.fillRect(px + xx, py + yy, cell, cell);
      }
    }
  }
  context.strokeStyle = 'rgba(255,255,255,0.25)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  context.globalAlpha = 1;
}

function gridColor() {
  if (currentSkin === 'neon') return '#1a1a2e';
  return GRID_COLORS[getTheme()];
}

function drawGrid() {
  ctx.strokeStyle = gridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const HB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!hold) return;
  const shape = PIECES[hold.type];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], HB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateAllTimeStats();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  if (qualifiesForHighScore(score)) {
    nameEntryBox.classList.remove('hidden');
    highScoreListGameOver.classList.add('hidden');
  } else {
    nameEntryBox.classList.add('hidden');
    renderHighScoreList(highScoreListGameOver, loadHighScores(), null);
    highScoreListGameOver.classList.remove('hidden');
  }
  renderAllTimeStats(comboStatGameOver, maxLinesStatGameOver);
  overlay.classList.remove('hidden');
}

function populateStartLevelSelect() {
  startLevelSelect.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = i;
    startLevelSelect.appendChild(opt);
  }
  startLevelSelect.value = startLevel;
}

function openPauseMenu() {
  pauseMainView.classList.remove('hidden');
  pauseControlsView.classList.add('hidden');
  startLevelSelect.value = startLevel;
  pauseOverlay.classList.remove('hidden');
}

function closePauseMenu() {
  pauseOverlay.classList.add('hidden');
}

function submitHighScoreName() {
  const name = (nameInput.value || 'AAA').trim().slice(0, 12) || 'AAA';
  const { list, newEntry } = addHighScoreTracked(name, score);
  nameEntryBox.classList.add('hidden');
  highScoreListGameOver.classList.remove('hidden');
  renderHighScoreList(highScoreListGameOver, list, newEntry);
  renderHighScoreList(highscoreListPanel, list, newEntry);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  hold = null;
  holdUsed = false;
  combo = 0;
  bestComboRun = 0;
  maxLinesRun = 0;
  holdCanvas.classList.remove('locked');
  next = randomPiece();
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && e.target === startLevelSelect) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

function getSkin() { return currentSkin; }

function applySkin(skin) {
  currentSkin = ['retro', 'neon', 'pastel', 'pixel'].includes(skin) ? skin : 'retro';
  document.documentElement.dataset.skin = currentSkin;
  skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_KEY, currentSkin);
  if (typeof current !== 'undefined') { draw(); drawNext(); drawHold(); }
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(saved || 'retro');
}

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

restartBtn.addEventListener('click', init);
submitNameBtn.addEventListener('click', submitHighScoreName);
resetScoresBtn.addEventListener('click', () => {
  resetHighScores();
  renderHighScoreList(highscoreListPanel, [], null);
  renderAllTimeStats(bestComboPanel, maxLinesPanel);
});

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
restartFromPauseBtn.addEventListener('click', () => { closePauseMenu(); init(); });
viewControlsBtn.addEventListener('click', () => {
  pauseMainView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
});
backToPauseBtn.addEventListener('click', () => {
  pauseControlsView.classList.add('hidden');
  pauseMainView.classList.remove('hidden');
});
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10);
});

initTheme();
populateStartLevelSelect();
initSkin();
init();
renderHighScoreList(highscoreListPanel, loadHighScores(), null);
renderAllTimeStats(bestComboPanel, maxLinesPanel);
