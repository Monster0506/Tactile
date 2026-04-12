/**
 * @param {object} app - Alpine component (presentation viewer)
 * @param {number} slideIndex
 * @returns {string}
 */
export function resolveSlideUrl(app, slideIndex) {
  const idx = typeof slideIndex === 'number' && slideIndex >= 0 ? slideIndex : 0;

  if (!app.slides || !Array.isArray(app.slides) || app.slides.length === 0) {
    console.log('No slides available, slides:', app.slides);
    return '';
  }

  if (idx >= app.slides.length) {
    console.log('Slide index out of bounds:', idx, 'Total slides:', app.slides.length);
    return '';
  }

  const slide = app.slides[idx];
  if (!slide) {
    console.log('No slide data for index:', idx, 'Total slides:', app.slides.length);
    return '';
  }

  console.log('Current slide data:', slide);

  let imageUrl = '';

  if (slide.imageUrl) {
    imageUrl = slide.imageUrl;
  } else if (slide.image_url) {
    imageUrl = slide.image_url;
  } else if (slide.url) {
    imageUrl = slide.url;
  } else if (slide.path) {
    imageUrl = slide.path;
  } else if (slide.image) {
    imageUrl = slide.image;
  } else if (slide.src) {
    imageUrl = slide.src;
  } else if (slide.filename) {
    imageUrl = `/slides/${slide.filename}`;
  } else if (typeof slide === 'string') {
    imageUrl = slide.startsWith('/') ? slide : `/slides/${slide}`;
  }

  console.log('Resolved image URL:', imageUrl);
  return imageUrl;
}

/**
 * @param {object} app - Alpine component (presentation viewer)
 * @returns {string}
 */
export function getCurrentSlideImage(app) {
  const slideIndex = typeof app.currentSlide === 'number' && app.currentSlide >= 0 ? app.currentSlide : 0;
  return resolveSlideUrl(app, slideIndex);
}
