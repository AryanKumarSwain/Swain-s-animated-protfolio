/**
 * Aryan Kumar Swain Portfolio — Motion Engine & Frame Sequence Renderer
 * 872 Frames sequence renderer with High-DPI canvas & adaptive background caching
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
const hud = document.getElementById('hud');
const hudFrame = document.getElementById('hud-frame');
const hudProgress = document.getElementById('hud-progress');
const scrollPrompt = document.getElementById('scroll-prompt');
const introOverlay = document.getElementById('intro-overlay');
const introLogo = document.getElementById('intro-logo');
const navbar = document.getElementById('navbar');

// State
const images = new Array(TOTAL_FRAMES);
const loaded = new Uint8Array(TOTAL_FRAMES);
const loading = new Uint8Array(TOTAL_FRAMES);

let loadedCount = 0;
let isInitialReady = false;
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

// Aspect ratio cover rendering on canvas with automatic watermark masking
function drawImageCover(img) {
  if (!img || !img.naturalWidth) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // Clear canvas before drawing for seamless black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, cw, ch);

  // Cover calculation
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;

  // On desktop screens, shift character slightly to the right to leave open space for typography
  // This matches the reference layout and prevents text from overlapping the character's face
  let offsetX = 0;
  const winW = window.innerWidth;
  if (winW >= 1280) {
    offsetX = cw * 0.15;
  } else if (winW >= 1024) {
    offsetX = cw * 0.11;
  } else if (winW >= 768) {
    offsetX = cw * 0.06;
  }

  const dx = (cw - dw) * 0.5 + offsetX;
  const verticalOffset = Math.min(ch * 0.06, 52);
  const dy = (ch - dh) * 0.5 + verticalOffset;

  ctx.drawImage(img, dx, dy, dw, dh);

  // Mask Gemini watermark in bottom right corner
  // The frame is 1080x608 with the watermark in the bottom-right corner.
  // Because the background is solid black, filling this corner completely conceals the watermark.
  const wmWidth = dw * 0.16;
  const wmHeight = dh * 0.22;
  const wmX = dx + dw - wmWidth;
  const wmY = dy + dh - wmHeight;
  ctx.fillStyle = '#000000';
  ctx.fillRect(wmX, wmY, wmWidth + 4, wmHeight + 4);
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

// Scroll calculation spanning the entire document height
function onScroll() {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollableHeight > 0) {
    targetProgress = Math.min(Math.max(window.scrollY / scrollableHeight, 0), 1);
  } else {
    targetProgress = 0;
  }

  if (window.scrollY > 40) {
    if (scrollPrompt) scrollPrompt.classList.add('hidden');
  } else {
    if (scrollPrompt) scrollPrompt.classList.remove('hidden');
  }
}

// Smooth Linear Interpolation Animation Loop
function animationLoop() {
  // Inertia lerp for ultra-smooth scrubbing
  const diff = targetProgress - currentProgress;
  if (Math.abs(diff) > 0.00005) {
    currentProgress += diff * 0.1;
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

  // Adaptive background queue priority update around current playhead
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
  const forwardWindow = 30;
  const backwardWindow = 12;

  for (let i = 1; i <= forwardWindow; i++) {
    queueFrame(centerIdx + i, true);
  }
  for (let i = 1; i <= backwardWindow; i++) {
    queueFrame(centerIdx - i, true);
  }
}

// Setup skill bars intersection observer
function setupInteractions() {
  const skillTrackers = document.querySelectorAll('.skill-fill');
  if ('IntersectionObserver' in window && skillTrackers.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.width = entry.target.style.getPropertyValue('--target-width') || '100%';
        }
      });
    }, { threshold: 0.2 });

    skillTrackers.forEach((tracker) => {
      tracker.style.width = '0%';
      observer.observe(tracker);
    });
  }
}

// Progressive Initial Loading
async function init() {
  handleResize();
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  setupInteractions();

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
        if (loaderBar) loaderBar.style.width = `${pct}%`;
        if (loaderPercent) loaderPercent.textContent = `${pct}%`;
      })
    );
  }

  // 3. Concurrently sample keyframes across sequence for seamless fast scrubbing
  for (let i = burstCount; i < TOTAL_FRAMES; i += 20) {
    queueFrame(i, false);
  }

  await Promise.all(initialBurst);

  // Ready! Fade out loader
  if (loader) loader.classList.add('hidden');

  // Play Zoom-in Intro Animation
  document.body.classList.add('no-scroll');
  
  setTimeout(() => {
    if (introLogo) introLogo.classList.add('animate-zoom');
    
    // Smoothly reveal UI as logo zooms toward the user
    setTimeout(() => {
      if (introOverlay) introOverlay.classList.add('hidden');
      if (hud) hud.classList.add('active');
      document.body.classList.remove('no-scroll');
      
      isInitialReady = true;
      requestAnimationFrame(animationLoop);
    }, 700);
  }, 450);

  // 4. Fill in remaining frames progressively in background
  for (let i = burstCount; i < TOTAL_FRAMES; i++) {
    queueFrame(i, false);
  }
}

init();
