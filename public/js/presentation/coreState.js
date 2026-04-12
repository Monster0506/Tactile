import { createDrawingState } from './state.js';

/**
 * Scalar and nested state for the presentation Alpine component.
 * Behaviors (methods) are merged separately — see behaviorsRegistry.js.
 */
export function createPresentationState() {
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
    /** Set true in handleMobileTouchStart when swipe tracking is allowed (laser + drawing off) */
    mobileSwipeArmed: false,

    drawing: createDrawingState(),

    /** Laser trail canvas + render loop (see laserUi.js) */
    laser: {
      lastEmit: 0,
      rafId: null,
      idleFrames: 0,
      targetNx: 0.5,
      targetNy: 0.5,
      displayNx: 0.5,
      displayNy: 0.5,
      prevDrawNx: null,
      prevDrawNy: null,
      sampleQueue: [],
      /** True when smoothing remote trail (other clients); local uses sample queue */
      remoteSmoothing: false
    }
  };
}
