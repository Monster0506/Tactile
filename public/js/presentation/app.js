import { getCurrentSlideImage } from './slideResolve.js';
import { EMPTY_IMG_DATA_URL } from './constants.js';
import { createPresentationState } from './coreState.js';
import { presentationBehaviors } from './behaviorsRegistry.js';
import { mergePresentationBehaviors } from './composeBehaviors.js';

export function presentationApp() {
  const component = createPresentationState();
  mergePresentationBehaviors(component, presentationBehaviors);

  Object.defineProperty(component, 'currentSlideImage', {
    enumerable: true,
    get() {
      return getCurrentSlideImage(this);
    }
  });

  Object.defineProperty(component, 'displaySlideNumber', {
    enumerable: true,
    get() {
      const n = typeof this.currentSlide === 'number' && !isNaN(this.currentSlide)
        ? this.currentSlide
        : 0;
      return n + 1;
    }
  });

  /** True if the slide stack should show (API URL or either layer holds a real image, not just the placeholder). */
  Object.defineProperty(component, 'showSlideStack', {
    enumerable: true,
    get() {
      const url = getCurrentSlideImage(this);
      const real = (u) => u && u !== EMPTY_IMG_DATA_URL;
      return !!(url || real(this.slideLayerUrl0) || real(this.slideLayerUrl1));
    }
  });

  component.init = function init() {
    this.detectDevice();
    this.presentationId = this.getPresentationId();
    this.setupSocket();
    this.setupKeyboardNavigation();
    this.setupNavigationHints();
    this.loadPresentation();
    this.startConnectionHealthCheck();

    this.$nextTick(() => {
      if (typeof this.setupLaserCanvas === 'function') {
        this.setupLaserCanvas();
      }
      this.initializeDrawing();
    });
  };

  return component;
}
