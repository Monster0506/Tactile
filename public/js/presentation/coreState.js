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

    drawing: createDrawingState()
  };
}
