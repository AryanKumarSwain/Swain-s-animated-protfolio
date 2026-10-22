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

// Motion Engine & Interaction State (Santioni Spirits style)
let lenis = null;
let scrollVelocity = 0;
let targetSkew = 0;
let currentSkew = 0;
let tickerOffset = 0;


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
function drawImageCover(img, index = 0) {
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

  // Horizontal responsive offsets (right vs left)
  let rightOffset = 0;
  const winW = window.innerWidth;
  if (winW >= 1440) {
    rightOffset = cw * 0.22;
  } else if (winW >= 1280) {
    rightOffset = cw * 0.20;
  } else if (winW >= 1024) {
    rightOffset = cw * 0.15;
  } else if (winW >= 768) {
    rightOffset = cw * 0.08;
  }
  const leftOffset = -rightOffset;

  // Choreographed horizontal positioning:
  // 1. Frame 0 -> 182: Smoothly shift from right to left as character turns to face right
  // 2. Frame 182 -> 333: Hold position on the left side
  // 3. Frame 333 -> 535: Smoothly shift from left to right as character turns to face left
  // 4. Frame 535 -> 721: Hold position on the right side
  // 5. Frame 721 -> 872: Smoothly shift into center for contact / finale
  let offsetX;
  let heroExitProgress = 0;

  if (index <= 182) {
    const p = Math.min(Math.max(index / 182, 0), 1);
    const ease = 0.5 - 0.5 * Math.cos(p * Math.PI);
    offsetX = rightOffset + (leftOffset - rightOffset) * ease;
    heroExitProgress = ease;
  } else if (index < 333) {
    offsetX = leftOffset;
    heroExitProgress = 1;
  } else if (index <= 535) {
    const p = Math.min(Math.max((index - 333) / (535 - 333), 0), 1);
    const ease = 0.5 - 0.5 * Math.cos(p * Math.PI);
    offsetX = leftOffset + (rightOffset - leftOffset) * ease;
    heroExitProgress = 1;
  } else if (index < 721) {
    offsetX = rightOffset;
    heroExitProgress = 1;
  } else {
    // 721 to 872: Smoothly shift from right to center (0)
    const p = Math.min(Math.max((index - 721) / (872 - 721), 0), 1);
    const ease = 0.5 - 0.5 * Math.cos(p * Math.PI);
    offsetX = rightOffset + (0 - rightOffset) * ease;
    heroExitProgress = 1;
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

  // Dynamically fade out the left gradient overlay as the hero exits
  const canvasViewport = document.getElementById('canvas-viewport');
  if (canvasViewport) {
    canvasViewport.style.setProperty('--overlay-left-alpha', (0.85 * (1 - heroExitProgress)).toFixed(3));
  }
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
    drawImageCover(img, index);
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

  if (lenis) {
    lenis.resize();
  }
}

// Scroll calculation spanning the entire document height
function onScroll(explicitScroll) {
  const currentY = typeof explicitScroll === 'number' ? explicitScroll : (lenis ? lenis.scroll : window.scrollY);
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollableHeight > 0) {
    targetProgress = Math.min(Math.max(currentY / scrollableHeight, 0), 1);
  } else {
    targetProgress = 0;
  }

  if (currentY > 40) {
    if (scrollPrompt) scrollPrompt.classList.add('hidden');
    if (navbar) navbar.classList.add('scrolled');
  } else {
    if (scrollPrompt) scrollPrompt.classList.remove('hidden');
    if (navbar) navbar.classList.remove('scrolled');
  }
}

// Smooth Linear Interpolation Animation Loop (60/120fps sync)
function animationLoop(time) {
  if (lenis) {
    lenis.raf(time);
  }

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
  }

  // Adaptive background queue priority update around current playhead
  ensureLocalBuffer(frameIdx);

  // Santioni Spirits dynamic scroll effects
  updateParallaxElements();

  currentSkew += (targetSkew - currentSkew) * 0.12;
  targetSkew *= 0.92;

  updateTickerTrack();

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

// Init Lenis smooth scroll
function initSmoothScroll() {
  if (typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.6,
      infinite: false,
    });

    lenis.on('scroll', ({ scroll, velocity }) => {
      scrollVelocity = velocity || 0;
      targetSkew = Math.min(Math.max(scrollVelocity * 0.04, -2.5), 2.5);
      onScroll(scroll);
    });
  }
}

// Parallax Component Movement Engine (Santioni Spirits / Active Theory style)
function updateParallaxElements() {
  const parallaxItems = document.querySelectorAll('.parallax-item');
  const vh = window.innerHeight;
  const vCenter = vh * 0.5;

  for (let i = 0; i < parallaxItems.length; i++) {
    const el = parallaxItems[i];
    const rect = el.getBoundingClientRect();

    // Check if element is near viewport
    if (rect.bottom < -200 || rect.top > vh + 200) continue;

    const elCenter = rect.top + rect.height * 0.5;
    const distFromCenter = elCenter - vCenter;

    const speedY = parseFloat(el.getAttribute('data-parallax-y') || 0);
    const speedX = parseFloat(el.getAttribute('data-parallax-x') || 0);
    const speedRotate = parseFloat(el.getAttribute('data-parallax-rotate') || 0);

    const py = distFromCenter * speedY;
    el.style.setProperty('--py', `${py.toFixed(1)}px`);

    if (speedX !== 0) {
      const px = distFromCenter * speedX;
      el.style.setProperty('--px', `${px.toFixed(1)}px`);
    }

    if (speedRotate !== 0) {
      const pr = distFromCenter * speedRotate;
      el.style.setProperty('--pr', `${pr.toFixed(2)}deg`);
    }

    if (Math.abs(currentSkew) > 0.01) {
      el.style.setProperty('--skew', `${currentSkew.toFixed(2)}deg`);
    } else {
      el.style.setProperty('--skew', '0deg');
    }
  }
}

// Ticker Marquee Velocity Response
function updateTickerTrack() {
  const tickerTrack = document.querySelector('.ticker-track');
  if (!tickerTrack) return;
  tickerOffset += (scrollVelocity * 0.5);
  tickerOffset *= 0.94;
  if (Math.abs(tickerOffset) > 0.1) {
    tickerTrack.style.transform = `translate3d(${tickerOffset.toFixed(1)}px, 0, 0)`;
  } else {
    tickerTrack.style.transform = '';
  }
}

// Scroll-triggered reveals
function setupScrollReveals() {
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          if (entry.target.hasAttribute('data-counter')) {
            animateCounter(entry.target);
          }
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

    revealElements.forEach((el) => revealObserver.observe(el));
  } else {
    revealElements.forEach((el) => el.classList.add('is-revealed'));
  }
}

// Number Counter Animation
function animateCounter(card) {
  if (card.dataset.counted) return;
  card.dataset.counted = 'true';
  const targetVal = parseInt(card.getAttribute('data-counter'), 10);
  const counterEl = card.querySelector('.counter-val');
  if (!counterEl || isNaN(targetVal)) return;

  const duration = 1500;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = Math.round(targetVal * ease);
    counterEl.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      counterEl.textContent = targetVal;
    }
  }
  requestAnimationFrame(step);
}

// 3D Tilt Cards with Spotlight Glare
function setupTiltCards() {
  const cards = document.querySelectorAll('.tilt-card');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      card.style.setProperty('--glare-x', `${((x / rect.width) * 100).toFixed(1)}%`);
      card.style.setProperty('--glare-y', `${((y / rect.height) * 100).toFixed(1)}%`);
      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

// Magnetic Buttons
function setupMagneticButtons() {
  const magneticBtns = document.querySelectorAll('.btn-magnetic');
  magneticBtns.forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      btn.style.transform = `translate3d(${(x * 0.28).toFixed(1)}px, ${(y * 0.28).toFixed(1)}px, 0)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translate3d(0, 0, 0)';
    });
  });
}

// Smooth Anchor Links via Lenis
function setupSmoothAnchorLinks() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#' || !targetId) return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        if (lenis) {
          lenis.scrollTo(target, { offset: -20, duration: 1.4 });
        } else {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

// Setup skill bars, reveals, 3D tilt, magnetic buttons & anchor links
function setupInteractions() {
  initSmoothScroll();
  setupScrollReveals();
  setupTiltCards();
  setupMagneticButtons();
  setupSmoothAnchorLinks();
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

// Local dev fallback for resume link (if running on localhost / file://)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
  const defaultResume = 'https://drive.google.com/file/d/173FW0jxBxwJafJapRmkyZjyjMNDnNvYN/view?usp=sharing';
  document.querySelectorAll('a[href="/api/resume"]').forEach((link) => {
    link.href = defaultResume;
  });
}
