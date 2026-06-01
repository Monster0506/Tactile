/**
 * @param {object} app - Alpine component (presentation viewer)
 * @param {number} slideIndex
 * @returns {string}
 */
export function resolveSlideUrl(app, slideIndex) {
  const idx = typeof slideIndex === 'number' && slideIndex >= 0 ? slideIndex : 0;

  if (!app.slides || !Array.isArray(app.slides) || app.slides.length === 0) {
    return '';
  }

  if (idx >= app.slides.length) {
    return '';
  }

  const slide = app.slides[idx];
  if (!slide) {
    return '';
  }

  if (slide.imageUrl) return slide.imageUrl;
  if (slide.image_url) return slide.image_url;
  if (slide.url) return slide.url;
  if (slide.path) return slide.path;
  if (slide.image) return slide.image;
  if (slide.src) return slide.src;
  if (slide.filename) return `/slides/${slide.filename}`;
  if (typeof slide === 'string') return slide.startsWith('/') ? slide : `/slides/${slide}`;

  return '';
}

/**
 * @param {object} app - Alpine component (presentation viewer)
 * @returns {string}
 */
export function getCurrentSlideImage(app) {
  const slideIndex = typeof app.currentSlide === 'number' && app.currentSlide >= 0 ? app.currentSlide : 0;
  return resolveSlideUrl(app, slideIndex);
}
