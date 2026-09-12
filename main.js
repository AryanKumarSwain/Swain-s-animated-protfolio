/**
 * Aryan Portfolio - Smooth Scroll-Driven Frame Animation Engine
 * 872 Frames sequence renderer with High-DPI canvas & adaptive caching
 */

const TOTAL_FRAMES = 872;
const FRAME_PREFIX = 'frames/frame_';
const FRAME_EXT = '.png';

// DOM Elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderPercent = document.getElementById('loader-percent');
const loaderStatus = document.getElementById('loader-status');
const hud = document.getElementById('hud');
const hudFrame = document.getElementById('hud-frame');
const hudProgress = document.getElementById('hud-progress');
const scrollPrompt = document.getElementById('scroll-prompt');

// State
const images = new Array(TOTAL_FRAMES);
const loaded = new Uint8Array(TOTAL_FRAMES);
const loading = new Uint8Array(TOTAL_FRAMES);

let loadedCount = 0;
let isInitialReady = false;
let currentFrameIndex = 0;
let targetProgress = 0;
let currentProgress = 0;
let lastRenderedFrame = -1;
let dpr = 1;

// Helper to format frame path
function getFramePath(index) {
  return `${FRAME_PREFIX}${String(index).padStart(6, '0')}${FRAME_EXT}`;
}

// Single image loader returning promise
function loadSingleFrame(index) {
  if (loaded[index] || loading[index]) return Promise.resolve();
  loading[index] = 1;

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = getFramePath(index);
    img.onload = () => {
      images[index] = img;
      loaded[index] = 1;
      loading[index] = 0;
      loadedCount++;
      resolve();
    };
    img.onerror = () => {
      loading[index] = 0;
      resolve();
    };
  });
}

// Aspect ratio cover rendering on canvas
function drawImageCover(img) {
  if (!img || !img.naturalWidth) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // Cover calculation
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) * 0.5;
  const dy = (ch - dh) * 0.5;

  ctx.drawImage(img, dx, dy, dw, dh);
}

// Find nearest loaded frame for zero-flicker fallback
function getBestFrame(targetIdx) {
  if (loaded[targetIdx]) return images[targetIdx];

  // Search bidirectionally for nearest ready frame
  for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
    const prev = targetIdx - offset;
    if (prev >= 0 && loaded[prev]) return images[prev];
    const next = targetIdx + offset;
    if (next < TOTAL_FRAMES && loaded[next]) return images[next];
  }
  return null;
}

// Render a specific frame index
function renderFrame(index) {
  const img = getBestFrame(index);
  if (img) {
    drawImageCover(img);
  }
}

// Resize canvas handling high DPI
function handleResize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  // Turn on high quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (lastRenderedFrame >= 0) {
    renderFrame(lastRenderedFrame);
  }
}

// Update HUD elements
function updateHUD(frameIndex, progress) {
  if (hudFrame) {
    hudFrame.textContent = `${String(frameIndex + 1).padStart(3, '0')} / ${TOTAL_FRAMES}`;
  }
  if (hudProgress) {
    hudProgress.textContent = `${Math.round(progress * 100)}%`;
  }
}

// Scroll calculation
function onScroll() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (maxScroll > 0) {
    targetProgress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
  } else {
    targetProgress = 0;
  }

  if (window.scrollY > 30) {
    scrollPrompt.classList.add('hidden');
  } else {
    scrollPrompt.classList.remove('hidden');
  }
}

// Smooth Linear Interpolation Animation Loop
function animationLoop() {
  // Inertia lerp
  const diff = targetProgress - currentProgress;
  if (Math.abs(diff) > 0.00005) {
    currentProgress += diff * 0.09;
  } else {
    currentProgress = targetProgress;
  }

  const frameIdx = Math.min(
    Math.max(Math.round(currentProgress * (TOTAL_FRAMES - 1)), 0),
    TOTAL_FRAMES - 1
  );

  if (frameIdx !== lastRenderedFrame) {
    renderFrame(frameIdx);
    lastRenderedFrame = frameIdx;
    updateHUD(frameIdx, currentProgress);
  }

  // Adaptive background queue priority update
  ensureLocalBuffer(frameIdx);

  requestAnimationFrame(animationLoop);
}

// Concurrent queue manager
const MAX_CONCURRENT = 8;
let activeDownloads = 0;
const priorityQueue = [];

function pumpQueue() {
  while (activeDownloads < MAX_CONCURRENT && priorityQueue.length > 0) {
    const nextIndex = priorityQueue.shift();
    if (!loaded[nextIndex] && !loading[nextIndex]) {
      activeDownloads++;
      loadSingleFrame(nextIndex).finally(() => {
        activeDownloads--;
        pumpQueue();
      });
    }
  }
}

function queueFrame(index, highPriority = false) {
  if (index < 0 || index >= TOTAL_FRAMES) return;
  if (loaded[index] || loading[index]) return;

  const existingPos = priorityQueue.indexOf(index);
  if (existingPos !== -1) {
    if (highPriority) {
      priorityQueue.splice(existingPos, 1);
      priorityQueue.unshift(index);
    }
    return;
  }

  if (highPriority) {
    priorityQueue.unshift(index);
  } else {
    priorityQueue.push(index);
  }
  pumpQueue();
}

// Buffer frames around current playback head
function ensureLocalBuffer(centerIdx) {
  // Immediate vicinity (forward & backward)
  const forwardWindow = 25;
  const backwardWindow = 10;

  for (let i = 1; i <= forwardWindow; i++) {
    queueFrame(centerIdx + i, true);
  }
  for (let i = 1; i <= backwardWindow; i++) {
    queueFrame(centerIdx - i, true);
  }
}

// Progressive Initial Loading
async function init() {
  handleResize();
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  // 1. First priority: Frame 0
  await loadSingleFrame(0);
  renderFrame(0);
  lastRenderedFrame = 0;

  // 2. Load initial burst (first 25 frames)
  const initialBurst = [];
  const burstCount = 25;
  for (let i = 1; i < burstCount; i++) {
    initialBurst.push(
      loadSingleFrame(i).then(() => {
        const pct = Math.round((loadedCount / burstCount) * 100);
        loaderBar.style.width = `${pct}%`;
        loaderPercent.textContent = `${pct}%`;
      })
    );
  }

  // 3. Concurrently sample keyframes across sequence for seamless fast scrubbing
  for (let i = burstCount; i < TOTAL_FRAMES; i += 20) {
    queueFrame(i, false);
  }

  await Promise.all(initialBurst);

  // Ready! Fade out loader
  loader.classList.add('hidden');
  hud.classList.add('active');
  scrollPrompt.classList.add('visible');
  isInitialReady = true;

  // Start smooth animation loop
  requestAnimationFrame(animationLoop);

  // 4. Fill in remaining frames progressively in background
  for (let i = burstCount; i < TOTAL_FRAMES; i++) {
    queueFrame(i, false);
  }
}

init();
