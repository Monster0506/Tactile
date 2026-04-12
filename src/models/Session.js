const crypto = require('crypto');

/**
 * Session model for managing real-time presentation sessions
 */
class Session {
  constructor(data = {}) {
    this.sessionId = data.sessionId || this.generateSessionId();
    this.presentationId = data.presentationId;
    this.currentSlide = data.currentSlide || 0;
    this.connectedClients = data.connectedClients || [];
    this.laserPointer = data.laserPointer || {
      x: 0,
      y: 0,
      active: false,
      lastUpdate: null
    };
    this.createdAt = data.createdAt || new Date();
    this.lastActivity = data.lastActivity || new Date();
  }

  /**
   * Generate unique session ID
   * @returns {string} Unique session ID
   */
  generateSessionId() {
    return crypto.randomBytes(12).toString('hex');
  }

  /**
   * Add client to session
   * @param {string} socketId - Socket ID of the client
   * @param {string} deviceType - Device type ('desktop' or 'mobile')
   * @returns {Object} Added client object
   */
  addClient(socketId, deviceType = 'desktop') {
    // Remove existing client with same socket ID if exists
    this.removeClient(socketId);

    const client = {
      socketId,
      deviceType,
      joinedAt: new Date()
    };

    this.connectedClients.push(client);
    this.updateLastActivity();
    
    return client;
  }

  /**
   * Remove client from session
   * @param {string} socketId - Socket ID of the client to remove
   * @returns {boolean} True if client was removed, false if not found
   */
  removeClient(socketId) {
    const initialLength = this.connectedClients.length;
    this.connectedClients = this.connectedClients.filter(
      client => client.socketId !== socketId
    );
    
    if (this.connectedClients.length < initialLength) {
      this.updateLastActivity();
      return true;
    }
    return false;
  }

  /**
   * Get client by socket ID
   * @param {string} socketId - Socket ID
   * @returns {Object|null} Client object or null if not found
   */
  getClient(socketId) {
    return this.connectedClients.find(client => client.socketId === socketId) || null;
  }

  /**
   * Get all connected clients
   * @returns {Array} Array of connected clients
   */
  getConnectedClients() {
    return [...this.connectedClients];
  }

  /**
   * Get count of connected clients
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.connectedClients.length;
  }

  /**
   * Get clients by device type
   * @param {string} deviceType - Device type ('desktop' or 'mobile')
   * @returns {Array} Array of clients with specified device type
   */
  getClientsByDeviceType(deviceType) {
    return this.connectedClients.filter(client => client.deviceType === deviceType);
  }

  /**
   * Update current slide
   * @param {number} slideIndex - New slide index
   * @returns {boolean} True if slide was updated, false if invalid index
   */
  updateCurrentSlide(slideIndex) {
    // Convert to number if it's a string representation of a number
    const numericSlideIndex = typeof slideIndex === 'string' ? parseInt(slideIndex, 10) : slideIndex;
    
    if (typeof numericSlideIndex === 'number' && !isNaN(numericSlideIndex) && numericSlideIndex >= 0) {
      this.currentSlide = numericSlideIndex;
      this.updateLastActivity();
      return true;
    }
    return false;
  }

  /**
   * Get current slide index
   * @returns {number} Current slide index
   */
  getCurrentSlide() {
    return this.currentSlide;
  }

  /**
   * Update laser pointer position and state
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {boolean} active - Whether laser pointer is active
   */
  updateLaserPointer(x, y, active = true) {
    this.laserPointer = {
      x: Number(x) || 0,
      y: Number(y) || 0,
      active: Boolean(active),
      lastUpdate: new Date()
    };
    this.updateLastActivity();
  }

  /**
   * Deactivate laser pointer
   */
  deactivateLaserPointer() {
    this.laserPointer.active = false;
    this.laserPointer.lastUpdate = new Date();
    this.updateLastActivity();
  }

  /**
   * Get laser pointer state
   * @returns {Object} Laser pointer state
   */
  getLaserPointer() {
    return { ...this.laserPointer };
  }

  /**
   * Check if laser pointer should auto-hide (inactive for 3+ seconds)
   * @returns {boolean} True if should auto-hide
   */
  shouldAutoHideLaserPointer() {
    if (!this.laserPointer.active || !this.laserPointer.lastUpdate) {
      return false;
    }
    
    const threeSecondsAgo = new Date(Date.now() - 3000);
    return this.laserPointer.lastUpdate < threeSecondsAgo;
  }

  /**
   * Update last activity timestamp
   */
  updateLastActivity() {
    this.lastActivity = new Date();
  }

  /**
   * Check if session is inactive (no activity for specified minutes)
   * @param {number} inactiveMinutes - Minutes of inactivity threshold (default: 30)
   * @returns {boolean} True if session is inactive
   */
  isInactive(inactiveMinutes = 30) {
    const thresholdTime = new Date(Date.now() - (inactiveMinutes * 60 * 1000));
    return this.lastActivity < thresholdTime;
  }

  /**
   * Check if session has any connected clients
   * @returns {boolean} True if session has connected clients
   */
  hasConnectedClients() {
    return this.connectedClients.length > 0;
  }

  /**
   * Convert session to JSON for storage/transmission
   * @returns {Object} JSON representation of session
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      presentationId: this.presentationId,
      currentSlide: this.currentSlide,
      connectedClients: this.connectedClients,
      laserPointer: this.laserPointer,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity
    };
  }

  /**
   * Create session from JSON data
   * @param {Object} data - JSON data
   * @returns {Session} Session instance
   */
  static fromJSON(data) {
    return new Session(data);
  }

  /**
   * Validate session data
   * @returns {Object} Validation result with isValid and errors
   */
  validate() {
    const errors = [];

    if (!this.sessionId || typeof this.sessionId !== 'string') {
      errors.push('Session ID is required and must be a string');
    }

    if (!this.presentationId || typeof this.presentationId !== 'string') {
      errors.push('Presentation ID is required and must be a string');
    }

    if (typeof this.currentSlide !== 'number' || this.currentSlide < 0) {
      errors.push('Current slide must be a non-negative number');
    }

    if (!Array.isArray(this.connectedClients)) {
      errors.push('Connected clients must be an array');
    }

    // Validate connected clients
    if (Array.isArray(this.connectedClients)) {
      this.connectedClients.forEach((client, index) => {
        if (!client.socketId || typeof client.socketId !== 'string') {
          errors.push(`Client ${index}: socketId is required and must be a string`);
        }
        if (!client.deviceType || !['desktop', 'mobile'].includes(client.deviceType)) {
          errors.push(`Client ${index}: deviceType must be 'desktop' or 'mobile'`);
        }
      });
    }

    // Validate laser pointer
    if (typeof this.laserPointer !== 'object') {
      errors.push('Laser pointer must be an object');
    } else {
      if (typeof this.laserPointer.x !== 'number') {
        errors.push('Laser pointer x coordinate must be a number');
      }
      if (typeof this.laserPointer.y !== 'number') {
        errors.push('Laser pointer y coordinate must be a number');
      }
      if (typeof this.laserPointer.active !== 'boolean') {
        errors.push('Laser pointer active state must be a boolean');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = Session;