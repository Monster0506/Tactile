import {
  SWIPE_MIN_DISTANCE,
  SWIPE_MAX_TIME_MS,
  SWIPE_MAX_VERTICAL,
  LASER_EMIT_INTERVAL_MS,
  LASER_FADE_STEP,
  LASER_REMOTE_SMOOTHING,
  LASER_MIN_SEGMENT_NORM,
  LASER_IDLE_FRAMES_STOP
} from './constants.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function laserCanvasForApp(app) {
  return app.isMobile ? app.$refs.mobileLaserTrailCanvas : app.$refs.laserTrailCanvas;
}

export const laserUi = {
  setupLaserCanvas() {
    this.resizeLaserCanvas();
    if (this.laser._resizeBound) return;
    this.laser._resizeBound = () => this.resizeLaserCanvas();
    window.addEventListener('resize', this.laser._resizeBound);
  },

  resizeLaserCanvas() {
    const canvas = laserCanvasForApp(this);
    if (!canvas) return;

    const host = this.isMobile
      ? document.querySelector('.mobile-slide-preview')
      : document.getElementById('slideDisplay');
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  },

  /** Fade previous frame so the trail decays smoothly */
  fadeLaserLayer(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${LASER_FADE_STEP})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },

  drawLaserStroke(ctx, w, h, x0, y0, x1, y1) {
    const px0 = x0 * w;
    const py0 = y0 * h;
    const px1 = x1 * w;
    const py1 = y1 * h;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = 'rgba(255, 70, 70, 0.42)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 110, 110, 0.9)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.stroke();

    const headR = 8;
    const g = ctx.createRadialGradient(px1, py1, 0, px1, py1, headR);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    g.addColorStop(0.35, 'rgba(255, 130, 130, 0.55)');
    g.addColorStop(0.72, 'rgba(255, 70, 70, 0.12)');
    g.addColorStop(1, 'rgba(255, 70, 70, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px1, py1, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  segmentSignificant(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return dx * dx + dy * dy >= LASER_MIN_SEGMENT_NORM * LASER_MIN_SEGMENT_NORM;
  },

  ensureLaserLoop() {
    if (this.laser.rafId != null) return;
    const tick = () => {
      this.laserAnimationFrame();

      const allowStop =
        this.laser.idleFrames >= LASER_IDLE_FRAMES_STOP && !this.isLaserActive;

      if (allowStop) {
        const canvas = laserCanvasForApp(this);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        this.laser.rafId = null;
        return;
      }
      this.laser.rafId = requestAnimationFrame(tick);
    };
    this.laser.rafId = requestAnimationFrame(tick);
  },

  laserAnimationFrame() {
    const canvas = laserCanvasForApp(this);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    this.fadeLaserLayer(ctx, w, h);

    let drew = false;

    if (this.laser.remoteSmoothing) {
      this.laser.displayNx += (this.laser.targetNx - this.laser.displayNx) * LASER_REMOTE_SMOOTHING;
      this.laser.displayNy += (this.laser.targetNy - this.laser.displayNy) * LASER_REMOTE_SMOOTHING;

      if (this.laser.prevDrawNx != null && this.segmentSignificant(
        this.laser.prevDrawNx,
        this.laser.prevDrawNy,
        this.laser.displayNx,
        this.laser.displayNy
      )) {
        this.drawLaserStroke(
          ctx,
          w,
          h,
          this.laser.prevDrawNx,
          this.laser.prevDrawNy,
          this.laser.displayNx,
          this.laser.displayNy
        );
        drew = true;
      }
      this.laser.prevDrawNx = this.laser.displayNx;
      this.laser.prevDrawNy = this.laser.displayNy;

      const near =
        Math.abs(this.laser.targetNx - this.laser.displayNx) < 0.0005 &&
        Math.abs(this.laser.targetNy - this.laser.displayNy) < 0.0005;
      if (near && !this.isLaserActive) {
        this.laser.idleFrames++;
      } else {
        this.laser.idleFrames = 0;
      }
    } else {
      const q = this.laser.sampleQueue;
      while (q.length) {
        const p = q.shift();
        if (this.laser.prevDrawNx == null) {
          this.laser.prevDrawNx = p.x;
          this.laser.prevDrawNy = p.y;
          continue;
        }
        if (this.segmentSignificant(this.laser.prevDrawNx, this.laser.prevDrawNy, p.x, p.y)) {
          this.drawLaserStroke(ctx, w, h, this.laser.prevDrawNx, this.laser.prevDrawNy, p.x, p.y);
          drew = true;
        }
        this.laser.prevDrawNx = p.x;
        this.laser.prevDrawNy = p.y;
      }
      if (this.isLaserActive) {
        this.laser.idleFrames = 0;
      } else if (!q.length) {
        this.laser.idleFrames++;
      }
    }
  },

  pushLocalLaserSample(nx, ny) {
    if (!this.isLaserActive || this.drawing.isDrawingMode) return;
    this.laser.remoteSmoothing = false;
    this.laser.sampleQueue.push({ x: clamp01(nx), y: clamp01(ny) });
    if (this.laser.sampleQueue.length > 96) {
      this.laser.sampleQueue.splice(0, this.laser.sampleQueue.length - 96);
    }
    this.laser.idleFrames = 0;
    this.ensureLaserLoop();
  },

  getLaserTargetElement() {
    if (this.isMobile) {
      return document.querySelector('.mobile-slide-preview');
    }
    return document.getElementById('slideDisplay');
  },

  normalizedLaserFromEvent(e) {
    const el = this.getLaserTargetElement();
    if (!el) return { nx: 0.5, ny: 0.5 };
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return { nx: 0.5, ny: 0.5 };
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return {
      nx: clamp01(cx / rect.width),
      ny: clamp01(cy / rect.height)
    };
  },

  onLaserPointerMove(e) {
    if (!this.isLaserActive || this.drawing.isDrawingMode) return;
    const { nx, ny } = this.normalizedLaserFromEvent(e);
    this.pushLocalLaserSample(nx, ny);
    this.emitLaserTrailSample(nx, ny);
  },

  onLaserTouchMove(e) {
    if (!this.isLaserActive || this.drawing.isDrawingMode) return;
    if (!e.touches?.length) return;
    const { nx, ny } = this.normalizedLaserFromEvent(e);
    this.pushLocalLaserSample(nx, ny);
    this.emitLaserTrailSample(nx, ny);
  },

  emitLaserTrailSample(nx, ny) {
    if (!this.socket?.connected) return;
    const now = Date.now();
    if (now - this.laser.lastEmit < LASER_EMIT_INTERVAL_MS) return;
    this.laser.lastEmit = now;
    this.socket.emit('laser-trail-point', { x: clamp01(nx), y: clamp01(ny), t: now });
  },

  clearLaserTrail() {
    const canvas = laserCanvasForApp(this);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.laser.sampleQueue.length = 0;
    this.laser.prevDrawNx = null;
    this.laser.prevDrawNy = null;
    this.laser.targetNx = 0.5;
    this.laser.targetNy = 0.5;
    this.laser.displayNx = 0.5;
    this.laser.displayNy = 0.5;
    this.laser.remoteSmoothing = false;
    this.laser.idleFrames = 0;
    if (this.laser.rafId != null) {
      cancelAnimationFrame(this.laser.rafId);
      this.laser.rafId = null;
    }
  },

  handleMobileTouchStart(e) {
    if (this.drawing.isDrawingMode || this.isLaserActive) {
      this.mobileSwipeArmed = false;
      return;
    }

    this.mobileSwipeArmed = true;
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  },

  handleMobileTouchEnd(e) {
    if (e.touches.length > 0) return;

    if (!this.mobileSwipeArmed) {
      return;
    }
    this.mobileSwipeArmed = false;

    if (this.drawing.isDrawingMode || this.isLaserActive) {
      return;
    }

    const touch = e.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;
    const touchEndTime = Date.now();

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;
    const deltaTime = touchEndTime - this.touchStartTime;

    if (deltaTime < SWIPE_MAX_TIME_MS && Math.abs(deltaY) < SWIPE_MAX_VERTICAL) {
      if (deltaX > SWIPE_MIN_DISTANCE) {
        this.previousSlide();
        this.showSwipeFeedback('right');
      } else if (deltaX < -SWIPE_MIN_DISTANCE) {
        this.nextSlide();
        this.showSwipeFeedback('left');
      }
    }
  },

  showSwipeFeedback(direction) {
    const slidePreview = document.querySelector('.mobile-slide-preview');
    if (!slidePreview) return;

    const feedback = document.createElement('div');
    feedback.className = `swipe-feedback ${direction}`;
    feedback.textContent = direction === 'left' ? '→' : '←';

    slidePreview.appendChild(feedback);

    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 300);
  },

  toggleLaserPointer() {
    this.isLaserActive = !this.isLaserActive;
    if (!this.isLaserActive) {
      this.clearLaserTrail();
    } else {
      this.laser.remoteSmoothing = false;
      this.resizeLaserCanvas();
    }
    this.socket.emit('laser-pointer', {
      active: this.isLaserActive
    });
    this.provideTactileFeedback();
  },

  provideTactileFeedback() {
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  },

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.log('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  },

  exitFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  },

  updateLaserPointer(x, y, active) {
    if (active === false) {
      this.clearLaserTrail();
    }
  },

  onRemoteLaserTrailPoint(data) {
    if (this.isLaserActive) return;
    if (typeof data?.x !== 'number' || typeof data?.y !== 'number') return;

    this.laser.remoteSmoothing = true;
    this.laser.sampleQueue.length = 0;
    this.laser.targetNx = clamp01(data.x);
    this.laser.targetNy = clamp01(data.y);
    if (this.laser.prevDrawNx == null) {
      this.laser.displayNx = this.laser.targetNx;
      this.laser.displayNy = this.laser.targetNy;
      this.laser.prevDrawNx = this.laser.displayNx;
      this.laser.prevDrawNy = this.laser.displayNy;
    }
    this.laser.idleFrames = 0;
    this.resizeLaserCanvas();
    this.ensureLaserLoop();
  }
};
