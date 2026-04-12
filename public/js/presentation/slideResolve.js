/**
 * @param {object} app - Alpine component (presentation viewer)
 * @returns {string}
 */
export function getCurrentSlideImage(app) {
  const slideIndex = typeof app.currentSlide === 'number' && app.currentSlide >= 0 ? app.currentSlide : 0;

  if (!app.slides || !Array.isArray(app.slides) || app.slides.length === 0) {
    console.log('No slides available, slides:', app.slides);
    return '';
  }

  if (slideIndex >= app.slides.length) {
    console.log('Slide index out of bounds:', slideIndex, 'Total slides:', app.slides.length);
    return '';
  }

  const slide = app.slides[slideIndex];
  if (!slide) {
    console.log('No slide data for index:', slideIndex, 'Total slides:', app.slides.length);
    return '';
  }

  console.log('Current slide data:', slide);

  let imageUrl = '';

  if (slide.imageUrl) {
    imageUrl = slide.imageUrl;
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
