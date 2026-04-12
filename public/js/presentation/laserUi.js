import {
  SWIPE_MIN_DISTANCE,
  SWIPE_MAX_TIME_MS,
  SWIPE_MAX_VERTICAL
} from './constants.js';

export const laserUi = {
  handleMobileTouchStart(e) {
    if (this.drawing.isDrawingMode) {
      return;
    }

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  },

  handleMobileTouchEnd(e) {
    if (this.drawing.isDrawingMode) {
      return;
    }

    if (e.touches.length > 0) return;

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
    this.socket.emit('laser-pointer', {
      x: 0.5,
      y: 0.5,
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
    if (this.isMobile) {
      this.updateMobileLaserPointer(x, y, active);
    } else {
      this.updateDesktopLaserPointer(x, y, active);
    }
  },

  syncLaserDot(dotId, dotClass, getContainer, x, y, active) {
    let laserDot = document.getElementById(dotId);
    if (active) {
      if (!laserDot) {
        laserDot = document.createElement('div');
        laserDot.id = dotId;
        laserDot.className = dotClass;
        document.body.appendChild(laserDot);
      }
      const container = getContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        laserDot.style.left = `${rect.left + x * rect.width}px`;
        laserDot.style.top = `${rect.top + y * rect.height}px`;
        laserDot.style.display = 'block';
      }
    } else if (laserDot) {
      laserDot.style.display = 'none';
    }
  },

  updateDesktopLaserPointer(x, y, active) {
    this.syncLaserDot('laserPointer', 'laser-pointer-dot', () => document.getElementById('slideDisplay'), x, y, active);
  },

  updateMobileLaserPointer(x, y, active) {
    this.syncLaserDot('mobileLaserPointer', 'mobile-laser-pointer-dot', () => document.querySelector('.mobile-slide-preview'), x, y, active);
  }
};
