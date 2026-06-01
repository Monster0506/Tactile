const fs = require('fs').promises;
const path = require('path');
const Presentation = require('../models/Presentation');
const Session = require('../models/Session');

/**
 * Storage service for managing presentations and sessions
 */
class StorageService {
  constructor() {
    this.dataDirectory = path.join(process.cwd(), 'data');
    this.presentationsFile = path.join(this.dataDirectory, 'presentations.json');
    this.sessionsFile = path.join(this.dataDirectory, 'sessions.json');
    this.uploadsDirectory = path.join(process.cwd(), 'uploads');
    this.slidesDirectory = path.join(this.uploadsDirectory, 'slides');
    
    // In-memory cache for active sessions
    this.activeSessions = new Map();
    this.presentations = new Map();
  }

  /**
   * Initialize storage directories and load existing data
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.createDirectories();
    await this.loadPresentations();
    await this.loadSessions();
  }

  /**
   * Create necessary directories
   * @returns {Promise<void>}
   */
  async createDirectories() {
    const directories = [
      this.dataDirectory,
      this.uploadsDirectory,
      this.slidesDirectory,
      path.join(this.uploadsDirectory, 'temp')
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw new Error(`Failed to create directory ${dir}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Save presentation to storage
   * @param {Presentation} presentation - Presentation instance
   * @returns {Promise<Presentation>} Saved presentation
   */
  async savePresentation(presentation) {
    if (!(presentation instanceof Presentation)) {
      throw new Error('Invalid presentation object');
    }

    const validation = presentation.validate();
    if (!validation.isValid) {
      throw new Error(`Presentation validation failed: ${validation.errors.join(', ')}`);
    }

    // Store in memory cache
    this.presentations.set(presentation.id, presentation);

    // Persist to file
    await this.savePresentationsToFile();

    return presentation;
  }

  /**
   * Get presentation by ID
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<Presentation|null>} Presentation or null if not found
   */
  async getPresentation(presentationId) {
    return this.presentations.get(presentationId) || null;
  }

  /**
   * If in-memory slides are empty but PNGs exist on disk (e.g. bad save / manual copy), rebuild metadata and persist.
   * @param {string} presentationId
   * @returns {Promise<Presentation|null>}
   */
  async rehydrateSlidesFromDiskIfEmpty(presentationId) {
    const presentation = this.presentations.get(presentationId);
    if (!presentation || !Array.isArray(presentation.slides) || presentation.slides.length > 0) {
      return presentation || null;
    }

    const dir = path.join(this.slidesDirectory, presentationId);
    let files;
    try {
      files = await fs.readdir(dir);
    } catch {
      return presentation;
    }

    const re = /^slide-(\d+)\.png$/;
    const nums = files
      .map((f) => {
        const m = re.exec(f);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n) => n != null)
      .sort((a, b) => a - b);

    if (nums.length === 0) {
      return presentation;
    }

    presentation.slides = nums.map((n) => ({
      id: `slide-${n}`,
      imageUrl: `/slides/${presentationId}/slide-${n}.png`,
      order: n
    }));

    try {
      await this.savePresentation(presentation);
    } catch (err) {
      console.error('rehydrateSlidesFromDiskIfEmpty: save failed', err);
    }

    return presentation;
  }

  /**
   * Get all presentations
   * @returns {Promise<Array>} Array of presentations
   */
  async getAllPresentations() {
    return Array.from(this.presentations.values());
  }

  /**
   * Delete presentation
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deletePresentation(presentationId) {
    const presentation = this.presentations.get(presentationId);
    if (!presentation) {
      return false;
    }

    // Delete associated files
    await presentation.delete();

    // Remove from cache
    this.presentations.delete(presentationId);

    // Persist changes
    await this.savePresentationsToFile();

    return true;
  }

  /**
   * Create new session for presentation
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<Session>} Created session
   */
  async createSession(presentationId) {
    const presentation = await this.getPresentation(presentationId);
    if (!presentation) {
      throw new Error('Presentation not found');
    }

    const session = new Session({ presentationId });
    
    // Update presentation with session ID
    presentation.sessionId = session.sessionId;
    await this.savePresentation(presentation);

    // Store session in memory cache
    this.activeSessions.set(session.sessionId, session);

    // Persist sessions
    await this.saveSessionsToFile();

    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Session|null>} Session or null if not found
   */
  async getSession(sessionId) {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Update session
   * @param {Session} session - Session instance
   * @returns {Promise<Session>} Updated session
   */
  async updateSession(session) {
    if (!(session instanceof Session)) {
      throw new Error('Invalid session object');
    }

    const validation = session.validate();
    if (!validation.isValid) {
      throw new Error(`Session validation failed: ${validation.errors.join(', ')}`);
    }

    // Update in memory cache
    this.activeSessions.set(session.sessionId, session);

    // Persist to file (debounced for performance)
    await this.saveSessionsToFile();

    return session;
  }

  /**
   * Delete session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove session ID from associated presentation
    if (session.presentationId) {
      const presentation = await this.getPresentation(session.presentationId);
      if (presentation && presentation.sessionId === sessionId) {
        presentation.sessionId = null;
        await this.savePresentation(presentation);
      }
    }

    // Remove from cache
    this.activeSessions.delete(sessionId);

    // Persist changes
    await this.saveSessionsToFile();

    return true;
  }

  /**
   * Get all active sessions
   * @returns {Promise<Array>} Array of active sessions
   */
  async getActiveSessions() {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Clean up inactive sessions
   * @param {number} inactiveMinutes - Minutes of inactivity threshold
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupInactiveSessions(inactiveMinutes = 30) {
    const sessions = Array.from(this.activeSessions.values());
    let cleanedCount = 0;

    for (const session of sessions) {
      if (session.isInactive(inactiveMinutes) && !session.hasConnectedClients()) {
        await this.deleteSession(session.sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Load presentations from file
   * @returns {Promise<void>}
   */
  async loadPresentations() {
    try {
      const data = await fs.readFile(this.presentationsFile, 'utf8');
      const presentationsData = JSON.parse(data);
      
      this.presentations.clear();
      for (const presentationData of presentationsData) {
        const presentation = Presentation.fromJSON(presentationData);
        this.presentations.set(presentation.id, presentation);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading presentations:', error.message);
      }
      // File doesn't exist yet, start with empty presentations
    }
  }

  /**
   * Save presentations to file
   * @returns {Promise<void>}
   */
  async savePresentationsToFile() {
    const presentationsData = Array.from(this.presentations.values()).map(p => p.toJSON());
    await fs.writeFile(this.presentationsFile, JSON.stringify(presentationsData, null, 2));
  }

  /**
   * Load sessions from file
   * @returns {Promise<void>}
   */
  async loadSessions() {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf8');
      const sessionsData = JSON.parse(data);
      
      this.activeSessions.clear();
      for (const sessionData of sessionsData) {
        const session = Session.fromJSON(sessionData);
        // Only load sessions that are not too old
        if (!session.isInactive(60)) { // 1 hour threshold for loading
          this.activeSessions.set(session.sessionId, session);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading sessions:', error.message);
      }
      // File doesn't exist yet, start with empty sessions
    }
  }

  /**
   * Save sessions to file
   * @returns {Promise<void>}
   */
  async saveSessionsToFile() {
    const sessionsData = Array.from(this.activeSessions.values()).map(s => s.toJSON());
    await fs.writeFile(this.sessionsFile, JSON.stringify(sessionsData, null, 2));
  }

  /**
   * Generate unique presentation URL
   * @param {string} presentationId - Presentation ID
   * @returns {string} Presentation URL
   */
  generatePresentationUrl(presentationId) {
    return `/presentation/${presentationId}`;
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage statistics
   */
  async getStorageStats() {
    const presentations = await this.getAllPresentations();
    const sessions = await this.getActiveSessions();
    
    let totalSlides = 0;
    let totalSize = 0;
    
    for (const presentation of presentations) {
      totalSlides += presentation.getTotalSlides();
      
      // Calculate directory size (approximate)
      try {
        const slidesDir = path.join(this.slidesDirectory, presentation.id);
        const files = await fs.readdir(slidesDir);
        for (const file of files) {
          const stats = await fs.stat(path.join(slidesDir, file));
          totalSize += stats.size;
        }
      } catch (error) {
        // Directory might not exist
      }
    }

    return {
      totalPresentations: presentations.length,
      totalSlides,
      totalSizeBytes: totalSize,
      activeSessions: sessions.length,
      connectedClients: sessions.reduce((total, session) => total + session.getClientCount(), 0)
    };
  }
}

module.exports = StorageService;