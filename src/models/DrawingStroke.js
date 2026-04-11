const crypto = require('crypto');

/**
 * DrawingStroke model for managing drawing data on slides
 */
class DrawingStroke {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.slideId = data.slideId;
    this.points = data.points || [];
    this.color = data.color || '#000000';
    this.width = data.width || 2;
    this.timestamp = data.timestamp || new Date();
  }

  /**
   * Generate unique stroke ID
   * @returns {string} Unique stroke ID
   */
  generateId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Add point to stroke
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  addPoint(x, y) {
    this.points.push({ x: Number(x), y: Number(y) });
  }

  /**
   * Get all points in stroke
   * @returns {Array} Array of points
   */
  getPoints() {
    return [...this.points];
  }

  /**
   * Get stroke length (number of points)
   * @returns {number} Number of points in stroke
   */
  getLength() {
    return this.points.length;
  }

  /**
   * Check if stroke is empty
   * @returns {boolean} True if stroke has no points
   */
  isEmpty() {
    return this.points.length === 0;
  }

  /**
   * Get bounding box of stroke
   * @returns {Object|null} Bounding box with min/max x/y or null if empty
   */
  getBoundingBox() {
    if (this.isEmpty()) {
      return null;
    }

    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }

  /**
   * Convert stroke to JSON for storage/transmission
   * @returns {Object} JSON representation of stroke
   */
  toJSON() {
    return {
      id: this.id,
      slideId: this.slideId,
      points: this.points,
      color: this.color,
      width: this.width,
      timestamp: this.timestamp
    };
  }

  /**
   * Create stroke from JSON data
   * @param {Object} data - JSON data
   * @returns {DrawingStroke} DrawingStroke instance
   */
  static fromJSON(data) {
    return new DrawingStroke(data);
  }

  /**
   * Validate stroke data
   * @returns {Object} Validation result with isValid and errors
   */
  validate() {
    const errors = [];

    if (!this.id || typeof this.id !== 'string') {
      errors.push('Stroke ID is required and must be a string');
    }

    if (!this.slideId || typeof this.slideId !== 'string') {
      errors.push('Slide ID is required and must be a string');
    }

    if (!Array.isArray(this.points)) {
      errors.push('Points must be an array');
    } else {
      this.points.forEach((point, index) => {
        if (typeof point.x !== 'number' || typeof point.y !== 'number') {
          errors.push(`Point ${index}: x and y coordinates must be numbers`);
        }
      });
    }

    if (!this.color || typeof this.color !== 'string') {
      errors.push('Color is required and must be a string');
    } else if (!/^#[0-9A-Fa-f]{6}$/.test(this.color)) {
      errors.push('Color must be a valid hex color (e.g., #FF0000)');
    }

    if (typeof this.width !== 'number' || this.width <= 0) {
      errors.push('Width must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = DrawingStroke;