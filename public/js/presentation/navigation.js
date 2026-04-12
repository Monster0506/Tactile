import { resolveSlideUrl } from './slideResolve.js';
import { EMPTY_IMG_DATA_URL } from './constants.js';

export const navigation = {
  setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          this.nextSlide();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          this.previousSlide();
          break;
        case 'Escape':
          e.preventDefault();
          this.exitFullscreen();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        default:
          break;
      }
    });
  },

  setupNavigationHints() {
    setTimeout(() => {
      this.hintsVisible = true;
    }, 1000);

    setTimeout(() => {
      this.hintsVisible = false;
    }, 6000);

    let hintTimeout;
    document.addEventListener('mousemove', () => {
      this.hintsVisible = true;
      clearTimeout(hintTimeout);
      hintTimeout = setTimeout(() => {
        this.hintsVisible = false;
      }, 3000);
    });

    document.addEventListener('keydown', () => {
      this.hintsVisible = true;
      clearTimeout(hintTimeout);
      hintTimeout = setTimeout(() => {
        this.hintsVisible = false;
      }, 3000);
    });
  },

  async loadPresentation() {
    if (!this.presentationId) {
      this.showError('No presentation ID found in URL');
      return;
    }

    try {
      const response = await fetch(`/api/presentation/${this.presentationId}`);

      if (!response.ok) {
        if (response.status === 404) {
          this.showError('Presentation not found');
        } else {
          this.showError('Failed to load presentation');
        }
        return;
      }

      this.presentationData = await response.json();
      this.slides = Array.isArray(this.presentationData.slides)
        ? this.presentationData.slides
        : [];
      this.totalSlides = this.slides.length;

      document.title = `${this.presentationData.title} - Presentation Viewer`;

      // Fresh crossfade state so the first paint always fills the visible layer (avoids race with empty slides)
      this.slideLayersReady = false;
      this.slideLayerUrl0 = '';
      this.slideLayerUrl1 = EMPTY_IMG_DATA_URL;
      this.slideActiveLayer = 0;
      this.slideError = false;

      this.displaySlide(0);
      this.joinPresentation();
    } catch (error) {
      console.error('Error loading presentation:', error);
      this.showError('Failed to load presentation');
    }
  },

  joinPresentation() {
    console.log('=== JOIN PRESENTATION ATTEMPT ===');
    console.log('Presentation ID:', this.presentationId);
    console.log('Socket connected:', this.socket?.connected);
    console.log('Presentation data loaded:', !!this.presentationData);

    if (this.presentationId) {
      const deviceType = this.isMobile ? 'mobile' : 'desktop';
      const joinData = {
        presentationId: this.presentationId,
        deviceType
      };

      console.log('Emitting join-presentation with data:', joinData);
      this.socket.emit('join-presentation', joinData);
      console.log('Join-presentation event emitted');
    } else {
      console.error('❌ Cannot join presentation - no presentation ID');
    }
    console.log('=== END JOIN PRESENTATION ATTEMPT ===');
  },

  displaySlide(slideIndex) {
    this.currentSlide = slideIndex;
    this.slideError = false;

    const url = resolveSlideUrl(this, slideIndex);

    if (!this.slideLayersReady) {
      this.slideLayerUrl0 = url;
      this.slideLayerUrl1 = EMPTY_IMG_DATA_URL;
      this.slideActiveLayer = 0;
      this.slideLayersReady = true;
    } else {
      const active = this.slideActiveLayer;
      const hidden = 1 - active;
      const activeUrl = active === 0 ? this.slideLayerUrl0 : this.slideLayerUrl1;
      const hiddenUrl = hidden === 0 ? this.slideLayerUrl0 : this.slideLayerUrl1;

      // Recover broken crossfade: URL ended up on the hidden layer while the visible layer is still empty
      if (
        url &&
        url !== EMPTY_IMG_DATA_URL &&
        (activeUrl === '' || activeUrl === EMPTY_IMG_DATA_URL)
      ) {
        if (active === 0) {
          this.slideLayerUrl0 = url;
          this.slideLayerUrl1 = EMPTY_IMG_DATA_URL;
        } else {
          this.slideLayerUrl1 = url;
          this.slideLayerUrl0 = EMPTY_IMG_DATA_URL;
        }
      } else if (url && url === activeUrl) {
        // Already showing this asset
      } else if (url && url === hiddenUrl && url !== EMPTY_IMG_DATA_URL) {
        this.slideActiveLayer = hidden;
      } else if (url) {
        if (hidden === 0) {
          this.slideLayerUrl0 = url;
        } else {
          this.slideLayerUrl1 = url;
        }
      }
    }

    if (typeof this.clearLaserTrail === 'function') {
      this.clearLaserTrail();
    }
    setTimeout(() => {
      if (this.isMobile) {
        if (typeof this.resizeMobileDrawingCanvas === 'function') {
          this.resizeMobileDrawingCanvas();
        }
        if (typeof this.resizeLaserCanvas === 'function') {
          this.resizeLaserCanvas();
        }
      }
      this.redrawCurrentSlide();
    }, 100);
  },

  onSlideLayerLoad(layerIdx) {
    const expected = resolveSlideUrl(this, this.currentSlide);
    const layerUrl = layerIdx === 0 ? this.slideLayerUrl0 : this.slideLayerUrl1;
    if (!expected || layerUrl !== expected) return;
    this.slideActiveLayer = layerIdx;
    if (this.isMobile) {
      this.$nextTick(() => {
        if (typeof this.onMobileSlideImageLoad === 'function') {
          this.onMobileSlideImageLoad();
        }
      });
    }
  },

  handleSlideLayerError() {
    this.slideError = true;
  },

  goToSlide(newSlide) {
    if (!this.socket?.connected || !this.presentationId) return false;
    if (typeof newSlide !== 'number' || newSlide < 0 || newSlide >= this.totalSlides) return false;
    this.socket.emit('slide-change', { slideIndex: newSlide });
    this.displaySlide(newSlide);
    this.provideTactileFeedback();
    return true;
  },

  nextSlide() {
    if (this.currentSlide < this.totalSlides - 1) {
      this.goToSlide(this.currentSlide + 1);
    }
  },

  previousSlide() {
    if (this.currentSlide > 0) {
      this.goToSlide(this.currentSlide - 1);
    }
  },

  handleSlideClick(e) {
    if (this.drawing.isDrawingMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (clickX > width / 2) {
      this.nextSlide();
    } else {
      this.previousSlide();
    }
  },

  handleSlideError() {
    this.slideError = true;
    console.error(`Failed to load slide ${this.currentSlide + 1}`, 'URL:', this.currentSlideImage);
  },

  showError(message) {
    console.error('Presentation error:', message);
  }
};
