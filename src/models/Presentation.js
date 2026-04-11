const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Presentation model for managing presentation data and slides
 */
class Presentation {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.title = data.title || 'Untitled Presentation';
    this.slides = data.slides || [];
    this.createdAt = data.createdAt || new Date();
    this.sessionId = data.sessionId || null;
    this.slidesDirectory = path.join('uploads', 'slides', this.id);
  }

  /**
   * Generate unique presentation ID
   * @returns {string} Unique presentation ID
   */
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate unique URL for presentation
   * @returns {string} Presentation URL path
   */
  generateUrl() {
    return `/presentation/${this.id}`;
  }

  /**
   * Add a slide to the presentation
   * @param {Object} slideData - Slide data containing imageUrl, thumbnailUrl, etc.
   * @returns {Object} Added slide with generated ID
   */
  addSlide(slideData) {
    const slide = {
      id: crypto.randomBytes(8).toString('hex'),
      imageUrl: slideData.imageUrl,
      thumbnailUrl: slideData.thumbnailUrl,
      drawings: [],
      order: this.slides.length,
      ...slideData
    };
    
    this.slides.push(slide);
    return slide;
  }

  /**
   * Get slide by ID
   * @param {string} slideId - Slide ID
   * @returns {Object|null} Slide object or null if not found
   */
  getSlide(slideId) {
    return this.slides.find(slide => slide.id === slideId) || null;
  }

  /**
   * Get slide by order/index
   * @param {number} index - Slide index
   * @returns {Object|null} Slide object or null if not found
   */
  getSlideByIndex(index) {
    return this.slides[index] || null;
  }

  /**
   * Get total number of slides
   * @returns {number} Total slide count
   */
  getTotalSlides() {
    return this.slides.length;
  }

  /**
   * Update slide drawings
   * @param {string} slideId - Slide ID
   * @param {Array} drawings - Array of drawing strokes
   */
  updateSlideDrawings(slideId, drawings) {
    const slide = this.getSlide(slideId);
    if (slide) {
      slide.drawings = drawings;
    }
  }

  /**
   * Create slides directory for file storage
   * @returns {Promise<void>}
   */
  async createSlidesDirectory() {
    try {
      await fs.mkdir(this.slidesDirectory, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create slides directory: ${error.message}`);
      }
    }
  }

  /**
   * Save slide image to file system
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} filename - Filename for the image
   * @returns {Promise<string>} Relative path to saved image
   */
  async saveSlideImage(imageBuffer, filename) {
    await this.createSlidesDirectory();
    
    const imagePath = path.join(this.slidesDirectory, filename);
    await fs.writeFile(imagePath, imageBuffer);
    
    // Return relative path for URL generation
    return path.join('slides', this.id, filename).replace(/\\/g, '/');
  }

  /**
   * Delete presentation and associated files
   * @returns {Promise<void>}
   */
  async delete() {
    try {
      await fs.rm(this.slidesDirectory, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine with force: true
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to delete presentation files: ${error.message}`);
      }
    }
  }

  /**
   * Convert presentation to JSON for storage/transmission
   * @returns {Object} JSON representation of presentation
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      slides: this.slides,
      createdAt: this.createdAt,
      sessionId: this.sessionId
    };
  }

  /**
   * Create presentation from JSON data
   * @param {Object} data - JSON data
   * @returns {Presentation} Presentation instance
   */
  static fromJSON(data) {
    return new Presentation(data);
  }

  /**
   * Validate presentation data
   * @returns {Object} Validation result with isValid and errors
   */
  validate() {
    const errors = [];

    if (!this.id || typeof this.id !== 'string') {
      errors.push('Presentation ID is required and must be a string');
    }

    if (!this.title || typeof this.title !== 'string') {
      errors.push('Presentation title is required and must be a string');
    }

    if (!Array.isArray(this.slides)) {
      errors.push('Slides must be an array');
    }

    // Validate each slide
    if (Array.isArray(this.slides)) {
      this.slides.forEach((slide, index) => {
        if (!slide.id || typeof slide.id !== 'string') {
          errors.push(`Slide ${index}: ID is required and must be a string`);
        }
        if (!slide.imageUrl || typeof slide.imageUrl !== 'string') {
          errors.push(`Slide ${index}: imageUrl is required and must be a string`);
        }
        if (typeof slide.order !== 'number') {
          errors.push(`Slide ${index}: order must be a number`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = Presentation;