const Session = require('../models/Session');

/**
 * SessionManager class for handling multiple presentation sessions and real-time synchronization
 */
class SessionManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map(); // sessionId -> Session
    this.presentationSessions = new Map(); // presentationId -> sessionId
    this.clientSessions = new Map(); // socketId -> sessionId
    
    // Auto-cleanup inactive sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Create a new session for a presentation
   * @param {string} presentationId - Presentation ID
   * @returns {Session} Created session
   */
  createSession(presentationId) {
    // Check if presentation already has an active session
    const existingSessionId = this.presentationSessions.get(presentationId);
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      return this.sessions.get(existingSessionId);
    }

    const session = new Session({ presentationId });
    this.sessions.set(session.sessionId, session);
    this.presentationSessions.set(presentationId, session.sessionId);
    
    console.log(`Created session ${session.sessionId} for presentation ${presentationId}`);
    return session;
  }

  /**
   * Get session by session ID
   * @param {string} sessionId - Session ID
   * @returns {Session|null} Session or null if not found
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get session by presentation ID
   * @param {string} presentationId - Presentation ID
   * @returns {Session|null} Session or null if not found
   */
  getSessionByPresentationId(presentationId) {
    const sessionId = this.presentationSessions.get(presentationId);
    return sessionId ? this.getSession(sessionId) : null;
  }

  /**
   * Join a client to a session
   * @param {string} sessionId - Session ID
   * @param {string} socketId - Socket ID
   * @param {string} deviceType - Device type ('desktop' or 'mobile')
   * @returns {boolean} True if successfully joined
   */
  joinSession(sessionId, socketId, deviceType = 'desktop', isObserver = false) {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Remove client from any existing session
    this.leaveSession(socketId);

    // Add client to new session
    session.addClient(socketId, deviceType, isObserver);
    this.clientSessions.set(socketId, sessionId);

    // Join socket room for this session
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(sessionId);
    }

    console.log(`Client ${socketId} (${deviceType}) joined session ${sessionId}`);
    
    // Broadcast client count update to all clients in session
    this.broadcastToSession(sessionId, 'client-connected', {
      clientCount: session.getClientCount(),
      deviceType
    });

    return true;
  }

  /**
   * Remove a client from their current session
   * @param {string} socketId - Socket ID
   * @returns {boolean} True if client was removed from a session
   */
  leaveSession(socketId) {
    const sessionId = this.clientSessions.get(socketId);
    if (!sessionId) {
      return false;
    }

    const session = this.getSession(sessionId);
    if (session) {
      const client = session.getClient(socketId);
      const removed = session.removeClient(socketId);
      
      if (removed) {
        console.log(`Client ${socketId} left session ${sessionId}`);
        
        // Leave socket room
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.leave(sessionId);
        }

        // Broadcast client count update
        this.broadcastToSession(sessionId, 'client-disconnected', {
          clientCount: session.getClientCount(),
          deviceType: client?.deviceType
        });

        // Clean up session if no clients remain (with a delay to handle reconnections)
        if (!session.hasConnectedClients()) {
          setTimeout(() => {
            // Double-check that session still has no clients after delay
            const currentSession = this.getSession(sessionId);
            if (currentSession && !currentSession.hasConnectedClients()) {
              this.cleanupSession(sessionId);
            }
          }, 5000); // 5 second delay to handle quick reconnections
        }
      }
    }

    this.clientSessions.delete(socketId);
    return true;
  }

  /**
   * Check whether a connected socket joined as an observer.
   * @param {string} socketId
   * @returns {boolean}
   */
  isClientObserver(socketId) {
    const sessionId = this.clientSessions.get(socketId);
    if (!sessionId) return false;
    const session = this.getSession(sessionId);
    if (!session) return false;
    const client = session.getClient(socketId);
    return client ? Boolean(client.isObserver) : false;
  }

  /**
   * Update slide for a session and broadcast to all clients
   * @param {string} sessionId - Session ID
   * @param {number} slideIndex - New slide index
   * @param {string} initiatorSocketId - Socket ID of client who initiated the change
   * @returns {boolean} True if slide was updated
   */
  updateSlide(sessionId, slideIndex, initiatorSocketId) {
    const session = this.getSession(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return false;
    }

    const updated = session.updateCurrentSlide(slideIndex);
    if (updated) {
      console.log(`Session ${sessionId}: Slide updated to ${slideIndex} by ${initiatorSocketId}`);
      
      // Broadcast to all clients in session
      this.broadcastToSession(sessionId, 'slide-updated', {
        slideIndex: session.getCurrentSlide(),
        initiatedBy: initiatorSocketId
      });
    } else {
      console.error(`Failed to update slide in session ${sessionId}: invalid slideIndex ${slideIndex} (type: ${typeof slideIndex})`);
    }

    return updated;
  }

  /**
   * Update laser pointer position and broadcast to all clients
   * @param {string} sessionId - Session ID
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {boolean} active - Whether laser pointer is active
   * @param {string} initiatorSocketId - Socket ID of client who initiated the change
   */
  updateLaserPointer(sessionId, x, y, active, initiatorSocketId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.updateLaserPointer(x, y, active);
    
    // Broadcast to all clients except the initiator
    this.broadcastToSession(sessionId, 'laser-position', {
      x: session.laserPointer.x,
      y: session.laserPointer.y,
      active: session.laserPointer.active
    }, initiatorSocketId);
  }

  /**
   * Deactivate laser pointer for a session
   * @param {string} sessionId - Session ID
   * @param {string} initiatorSocketId - Socket ID of client who initiated the change
   */
  deactivateLaserPointer(sessionId, initiatorSocketId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.deactivateLaserPointer();
    
    // Broadcast to all clients
    this.broadcastToSession(sessionId, 'laser-position', {
      x: session.laserPointer.x,
      y: session.laserPointer.y,
      active: false
    });
  }

  /**
   * Relay a normalized laser trail sample to other clients (sender excluded).
   * @param {string} sessionId
   * @param {{ x: number, y: number, t: number }} data
   * @param {string} initiatorSocketId
   */
  handleLaserTrailPoint(sessionId, data, initiatorSocketId) {
    this.broadcastToSession(sessionId, 'laser-trail-point', data, initiatorSocketId);
  }

  /**
   * Broadcast drawing data to all clients in a session
   * @param {string} sessionId - Session ID
   * @param {Object} drawingData - Drawing stroke data
   * @param {string} initiatorSocketId - Socket ID of client who initiated the drawing
   */
  syncDrawing(sessionId, drawingData, initiatorSocketId) {
    // Broadcast to all clients except the initiator
    this.broadcastToSession(sessionId, 'drawing-data', drawingData, initiatorSocketId);
  }

  /**
   * Handle drawing start event
   * @param {string} sessionId - Session ID
   * @param {Object} data - Drawing start data
   * @param {string} initiatorSocketId - Socket ID of client who initiated the drawing
   */
  handleDrawingStart(sessionId, data, initiatorSocketId) {
    this.broadcastToSession(sessionId, 'drawing-start', data, initiatorSocketId);
  }

  /**
   * Handle drawing move event
   * @param {string} sessionId - Session ID
   * @param {Object} data - Drawing move data
   * @param {string} initiatorSocketId - Socket ID of client who initiated the drawing
   */
  handleDrawingMove(sessionId, data, initiatorSocketId) {
    this.broadcastToSession(sessionId, 'drawing-move', data, initiatorSocketId);
  }

  /**
   * Handle drawing end event
   * @param {string} sessionId - Session ID
   * @param {Object} data - Drawing end data
   * @param {string} initiatorSocketId - Socket ID of client who initiated the drawing
   */
  handleDrawingEnd(sessionId, data, initiatorSocketId) {
    this.broadcastToSession(sessionId, 'drawing-end', data, initiatorSocketId);
  }

  /**
   * Handle drawing clear event
   * @param {string} sessionId - Session ID
   * @param {Object} data - Drawing clear data
   * @param {string} initiatorSocketId - Socket ID of client who initiated the clear
   */
  handleDrawingClear(sessionId, data, initiatorSocketId) {
    this.broadcastToSession(sessionId, 'drawing-clear', data, initiatorSocketId);
  }

  /**
   * Get session state for a client
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session state or null if session not found
   */
  getSessionState(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      presentationId: session.presentationId,
      currentSlide: session.getCurrentSlide(),
      clientCount: session.getClientCount(),
      laserPointer: session.getLaserPointer()
    };
  }

  /**
   * Broadcast message to all clients in a session
   * @param {string} sessionId - Session ID
   * @param {string} event - Event name
   * @param {Object} data - Data to broadcast
   * @param {string} excludeSocketId - Socket ID to exclude from broadcast
   */
  broadcastToSession(sessionId, event, data, excludeSocketId = null) {
    if (excludeSocketId) {
      // Broadcast to all clients in session except the excluded one
      this.io.to(sessionId).except(excludeSocketId).emit(event, data);
    } else {
      // Broadcast to all clients in session
      this.io.to(sessionId).emit(event, data);
    }
  }

  /**
   * Send message to a specific client
   * @param {string} socketId - Socket ID
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   */
  sendToClient(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }

  /**
   * Clean up a specific session
   * @param {string} sessionId - Session ID to clean up
   */
  cleanupSession(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      // Remove from presentation mapping
      this.presentationSessions.delete(session.presentationId);
      
      // Remove all client mappings for this session
      for (const [socketId, mappedSessionId] of this.clientSessions.entries()) {
        if (mappedSessionId === sessionId) {
          this.clientSessions.delete(socketId);
        }
      }
      
      // Remove session
      this.sessions.delete(sessionId);
      
      console.log(`Cleaned up session ${sessionId}`);
    }
  }

  /**
   * Clean up inactive sessions (no clients and inactive for 30+ minutes)
   */
  cleanupInactiveSessions() {
    const sessionsToCleanup = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.hasConnectedClients() && session.isInactive(30)) {
        sessionsToCleanup.push(sessionId);
      }
    }
    
    sessionsToCleanup.forEach(sessionId => {
      this.cleanupSession(sessionId);
    });
    
    if (sessionsToCleanup.length > 0) {
      console.log(`Cleaned up ${sessionsToCleanup.length} inactive sessions`);
    }
  }

  /**
   * Auto-hide laser pointers that have been inactive for 3+ seconds
   */
  autoHideLaserPointers() {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.shouldAutoHideLaserPointer()) {
        session.deactivateLaserPointer();
        this.broadcastToSession(sessionId, 'laser-position', {
          x: session.laserPointer.x,
          y: session.laserPointer.y,
          active: false
        });
      }
    }
  }

  /**
   * Get statistics about active sessions
   * @returns {Object} Session statistics
   */
  getStats() {
    const totalSessions = this.sessions.size;
    const totalClients = Array.from(this.sessions.values())
      .reduce((sum, session) => sum + session.getClientCount(), 0);
    
    const deviceStats = Array.from(this.sessions.values())
      .reduce((stats, session) => {
        const desktopClients = session.getClientsByDeviceType('desktop').length;
        const mobileClients = session.getClientsByDeviceType('mobile').length;
        stats.desktop += desktopClients;
        stats.mobile += mobileClients;
        return stats;
      }, { desktop: 0, mobile: 0 });

    return {
      totalSessions,
      totalClients,
      deviceStats,
      activePresentations: this.presentationSessions.size
    };
  }

  /**
   * Destroy the session manager and clean up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clean up all sessions
    const sessionIds = Array.from(this.sessions.keys());
    sessionIds.forEach(sessionId => this.cleanupSession(sessionId));
    
    console.log('SessionManager destroyed');
  }
}

module.exports = SessionManager;