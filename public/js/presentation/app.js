import { getCurrentSlideImage } from './slideResolve.js';
import { createDrawingState } from './state.js';
import { device } from './device.js';
import { socketApi } from './socket.js';
import { navigation } from './navigation.js';
import { laserUi } from './laserUi.js';
import { drawing } from './drawing.js';

export function presentationApp() {
  return {
    socket: null,
    presentationId: '',
    currentSlide: 0,
    totalSlides: 0,
    slides: [],
    presentationData: null,
    slideError: false,
    isConnected: false,
    clientCount: 1,
    isMobile: false,
    isLaserActive: false,
    hintsVisible: false,

    touchStartX: 0,
    touchStartY: 0,
    touchStartTime: 0,

    drawing: createDrawingState(),

    get currentSlideImage() {
      return getCurrentSlideImage(this);
    },

    get displaySlideNumber() {
      const n = typeof this.currentSlide === 'number' && !isNaN(this.currentSlide)
        ? this.currentSlide
        : 0;
      return n + 1;
    },

    ...device,
    ...socketApi,
    ...navigation,
    ...laserUi,
    ...drawing,

    init() {
      this.detectDevice();
      this.presentationId = this.getPresentationId();
      this.setupSocket();
      this.setupKeyboardNavigation();
      this.setupNavigationHints();
      this.loadPresentation();
      this.startConnectionHealthCheck();

      this.$nextTick(() => {
        this.initializeDrawing();
      });
    }
  };
}
