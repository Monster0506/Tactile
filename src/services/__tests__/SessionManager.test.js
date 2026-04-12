const SessionManager = require('../SessionManager');
const Session = require('../../models/Session');

// Mock Socket.IO
const mockIo = {
  to: jest.fn().mockReturnThis(),
  except: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: {
    sockets: new Map()
  }
};

const mockSocket = {
  join: jest.fn(),
  leave: jest.fn()
};

describe('SessionManager', () => {
  let sessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionManager = new SessionManager(mockIo);
    
    // Clear the mock socket map
    mockIo.sockets.sockets.clear();
  });

  afterEach(() => {
    if (sessionManager) {
      sessionManager.destroy();
    }
  });

  describe('Session Creation', () => {
    test('should create a new session for a presentation', () => {
      const presentationId = 'test-presentation-123';
      const session = sessionManager.createSession(presentationId);

      expect(session).toBeInstanceOf(Session);
      expect(session.presentationId).toBe(presentationId);
      expect(sessionManager.sessions.has(session.sessionId)).toBe(true);
      expect(sessionManager.presentationSessions.get(presentationId)).toBe(session.sessionId);
    });

    test('should return existing session if presentation already has one', () => {
      const presentationId = 'test-presentation-123';
      const session1 = sessionManager.createSession(presentationId);
      const session2 = sessionManager.createSession(presentationId);

      expect(session1.sessionId).toBe(session2.sessionId);
      expect(sessionManager.sessions.size).toBe(1);
    });

    test('should get session by session ID', () => {
      const presentationId = 'test-presentation-123';
      const session = sessionManager.createSession(presentationId);
      
      const retrievedSession = sessionManager.getSession(session.sessionId);
      expect(retrievedSession).toBe(session);
    });

    test('should get session by presentation ID', () => {
      const presentationId = 'test-presentation-123';
      const session = sessionManager.createSession(presentationId);
      
      const retrievedSession = sessionManager.getSessionByPresentationId(presentationId);
      expect(retrievedSession).toBe(session);
    });

    test('should return null for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('Client Management', () => {
    let session;
    const presentationId = 'test-presentation-123';
    const socketId = 'socket-123';

    beforeEach(() => {
      session = sessionManager.createSession(presentationId);
      mockIo.sockets.sockets.set(socketId, mockSocket);
    });

    test('should join client to session', () => {
      const joined = sessionManager.joinSession(session.sessionId, socketId, 'desktop');

      expect(joined).toBe(true);
      expect(sessionManager.clientSessions.get(socketId)).toBe(session.sessionId);
      expect(session.getClientCount()).toBe(1);
      expect(mockSocket.join).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.emit).toHaveBeenCalledWith('client-connected', {
        clientCount: 1,
        deviceType: 'desktop'
      });
    });

    test('should not join client to non-existent session', () => {
      const joined = sessionManager.joinSession('non-existent-session', socketId, 'desktop');

      expect(joined).toBe(false);
      expect(sessionManager.clientSessions.has(socketId)).toBe(false);
    });

    test('should remove client from previous session when joining new one', () => {
      const session2 = sessionManager.createSession('presentation-456');
      
      // Join first session
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');
      expect(session.getClientCount()).toBe(1);
      
      // Join second session
      sessionManager.joinSession(session2.sessionId, socketId, 'mobile');
      expect(session.getClientCount()).toBe(0);
      expect(session2.getClientCount()).toBe(1);
      expect(sessionManager.clientSessions.get(socketId)).toBe(session2.sessionId);
    });

    test('should leave session', () => {
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');
      
      const left = sessionManager.leaveSession(socketId);

      expect(left).toBe(true);
      expect(session.getClientCount()).toBe(0);
      expect(sessionManager.clientSessions.has(socketId)).toBe(false);
      expect(mockSocket.leave).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.emit).toHaveBeenCalledWith('client-disconnected', {
        clientCount: 0,
        deviceType: 'desktop'
      });
    });

    test('should not leave session if client not in any session', () => {
      const left = sessionManager.leaveSession('non-existent-socket');
      expect(left).toBe(false);
    });

    test('should cleanup session when last client leaves', () => {
      jest.useFakeTimers();
      try {
        sessionManager.joinSession(session.sessionId, socketId, 'desktop');
        sessionManager.leaveSession(socketId);

        expect(sessionManager.sessions.has(session.sessionId)).toBe(true);

        jest.advanceTimersByTime(5000);

        expect(sessionManager.sessions.has(session.sessionId)).toBe(false);
        expect(sessionManager.presentationSessions.has(presentationId)).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Slide Navigation', () => {
    let session;
    const socketId = 'socket-123';

    beforeEach(() => {
      session = sessionManager.createSession('test-presentation-123');
      mockIo.sockets.sockets.set(socketId, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');
    });

    test('should update slide and broadcast to all clients', () => {
      const slideIndex = 5;
      const updated = sessionManager.updateSlide(session.sessionId, slideIndex, socketId);

      expect(updated).toBe(true);
      expect(session.getCurrentSlide()).toBe(slideIndex);
      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.emit).toHaveBeenCalledWith('slide-updated', {
        slideIndex: slideIndex,
        initiatedBy: socketId
      });
    });

    test('should not update slide for non-existent session', () => {
      const updated = sessionManager.updateSlide('non-existent-session', 5, socketId);
      expect(updated).toBe(false);
    });

    test('should not update slide with invalid index', () => {
      const updated = sessionManager.updateSlide(session.sessionId, -1, socketId);
      expect(updated).toBe(false);
    });
  });

  describe('Laser Pointer Management', () => {
    let session;
    const socketId = 'socket-123';

    beforeEach(() => {
      session = sessionManager.createSession('test-presentation-123');
      mockIo.sockets.sockets.set(socketId, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');
    });

    test('should update laser pointer position and broadcast', () => {
      const x = 100;
      const y = 200;
      
      sessionManager.updateLaserPointer(session.sessionId, x, y, true, socketId);

      const laserPointer = session.getLaserPointer();
      expect(laserPointer.x).toBe(x);
      expect(laserPointer.y).toBe(y);
      expect(laserPointer.active).toBe(true);
      
      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.except).toHaveBeenCalledWith(socketId);
      expect(mockIo.emit).toHaveBeenCalledWith('laser-position', {
        x: x,
        y: y,
        active: true
      });
    });

    test('should deactivate laser pointer', () => {
      sessionManager.deactivateLaserPointer(session.sessionId, socketId);

      const laserPointer = session.getLaserPointer();
      expect(laserPointer.active).toBe(false);
      
      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.emit).toHaveBeenCalledWith('laser-position', {
        x: laserPointer.x,
        y: laserPointer.y,
        active: false
      });
    });

    test('should not update laser pointer for non-existent session', () => {
      // Should not throw error
      sessionManager.updateLaserPointer('non-existent-session', 100, 200, true, socketId);
      sessionManager.deactivateLaserPointer('non-existent-session', socketId);
    });
  });

  describe('Drawing Synchronization', () => {
    let session;
    const socketId = 'socket-123';

    beforeEach(() => {
      session = sessionManager.createSession('test-presentation-123');
      mockIo.sockets.sockets.set(socketId, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');
    });

    test('should sync drawing data to other clients', () => {
      const drawingData = {
        type: 'stroke',
        points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        color: '#ff0000'
      };

      sessionManager.syncDrawing(session.sessionId, drawingData, socketId);

      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.except).toHaveBeenCalledWith(socketId);
      expect(mockIo.emit).toHaveBeenCalledWith('drawing-data', drawingData);
    });
  });

  describe('Session State Management', () => {
    let session;
    const socketId = 'socket-123';

    beforeEach(() => {
      session = sessionManager.createSession('test-presentation-123');
      mockIo.sockets.sockets.set(socketId, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');
    });

    test('should get session state', () => {
      session.updateCurrentSlide(3);
      session.updateLaserPointer(50, 75, true);

      const state = sessionManager.getSessionState(session.sessionId);

      expect(state).toEqual({
        sessionId: session.sessionId,
        presentationId: session.presentationId,
        currentSlide: 3,
        clientCount: 1,
        laserPointer: {
          x: 50,
          y: 75,
          active: true,
          lastUpdate: expect.any(Date)
        }
      });
    });

    test('should return null for non-existent session state', () => {
      const state = sessionManager.getSessionState('non-existent-session');
      expect(state).toBeNull();
    });
  });

  describe('Broadcasting', () => {
    let session;
    const socketId1 = 'socket-123';
    const socketId2 = 'socket-456';

    beforeEach(() => {
      session = sessionManager.createSession('test-presentation-123');
      mockIo.sockets.sockets.set(socketId1, mockSocket);
      mockIo.sockets.sockets.set(socketId2, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId1, 'desktop');
      sessionManager.joinSession(session.sessionId, socketId2, 'mobile');
    });

    test('should broadcast to all clients in session', () => {
      const eventData = { message: 'test' };
      
      sessionManager.broadcastToSession(session.sessionId, 'test-event', eventData);

      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.emit).toHaveBeenCalledWith('test-event', eventData);
    });

    test('should broadcast to all clients except excluded one', () => {
      const eventData = { message: 'test' };
      
      sessionManager.broadcastToSession(session.sessionId, 'test-event', eventData, socketId1);

      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.except).toHaveBeenCalledWith(socketId1);
      expect(mockIo.emit).toHaveBeenCalledWith('test-event', eventData);
    });

    test('should send message to specific client', () => {
      const eventData = { message: 'test' };
      
      sessionManager.sendToClient(socketId1, 'test-event', eventData);

      expect(mockIo.to).toHaveBeenCalledWith(socketId1);
      expect(mockIo.emit).toHaveBeenCalledWith('test-event', eventData);
    });
  });

  describe('Session Cleanup', () => {
    test('should cleanup specific session', () => {
      const presentationId = 'test-presentation-123';
      const session = sessionManager.createSession(presentationId);
      const socketId = 'socket-123';
      
      mockIo.sockets.sockets.set(socketId, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');

      sessionManager.cleanupSession(session.sessionId);

      expect(sessionManager.sessions.has(session.sessionId)).toBe(false);
      expect(sessionManager.presentationSessions.has(presentationId)).toBe(false);
      expect(sessionManager.clientSessions.has(socketId)).toBe(false);
    });

    test('should cleanup inactive sessions', () => {
      const session = sessionManager.createSession('test-presentation-123');
      
      // Make session inactive by setting old lastActivity
      session.lastActivity = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago
      
      sessionManager.cleanupInactiveSessions();

      expect(sessionManager.sessions.has(session.sessionId)).toBe(false);
    });

    test('should not cleanup active sessions', () => {
      const session = sessionManager.createSession('test-presentation-123');
      const socketId = 'socket-123';
      
      mockIo.sockets.sockets.set(socketId, mockSocket);
      sessionManager.joinSession(session.sessionId, socketId, 'desktop');

      sessionManager.cleanupInactiveSessions();

      expect(sessionManager.sessions.has(session.sessionId)).toBe(true);
    });
  });

  describe('Auto-hide Laser Pointers', () => {
    test('should auto-hide inactive laser pointers', () => {
      const session = sessionManager.createSession('test-presentation-123');
      
      // Set laser pointer active but with old timestamp
      session.laserPointer = {
        x: 100,
        y: 200,
        active: true,
        lastUpdate: new Date(Date.now() - 4000) // 4 seconds ago
      };

      sessionManager.autoHideLaserPointers();

      expect(session.laserPointer.active).toBe(false);
      expect(mockIo.to).toHaveBeenCalledWith(session.sessionId);
      expect(mockIo.emit).toHaveBeenCalledWith('laser-position', {
        x: 100,
        y: 200,
        active: false
      });
    });

    test('should not auto-hide recently active laser pointers', () => {
      const session = sessionManager.createSession('test-presentation-123');
      
      // Set laser pointer active with recent timestamp
      session.laserPointer = {
        x: 100,
        y: 200,
        active: true,
        lastUpdate: new Date(Date.now() - 1000) // 1 second ago
      };

      sessionManager.autoHideLaserPointers();

      expect(session.laserPointer.active).toBe(true);
    });
  });

  describe('Statistics', () => {
    test('should get session statistics', () => {
      const session1 = sessionManager.createSession('presentation-1');
      const session2 = sessionManager.createSession('presentation-2');
      
      const socket1 = 'socket-1';
      const socket2 = 'socket-2';
      const socket3 = 'socket-3';
      
      mockIo.sockets.sockets.set(socket1, mockSocket);
      mockIo.sockets.sockets.set(socket2, mockSocket);
      mockIo.sockets.sockets.set(socket3, mockSocket);
      
      sessionManager.joinSession(session1.sessionId, socket1, 'desktop');
      sessionManager.joinSession(session1.sessionId, socket2, 'mobile');
      sessionManager.joinSession(session2.sessionId, socket3, 'desktop');

      const stats = sessionManager.getStats();

      expect(stats).toEqual({
        totalSessions: 2,
        totalClients: 3,
        deviceStats: {
          desktop: 2,
          mobile: 1
        },
        activePresentations: 2
      });
    });

    test('should get empty statistics when no sessions', () => {
      const stats = sessionManager.getStats();

      expect(stats).toEqual({
        totalSessions: 0,
        totalClients: 0,
        deviceStats: {
          desktop: 0,
          mobile: 0
        },
        activePresentations: 0
      });
    });
  });

  describe('Destruction', () => {
    test('should destroy session manager and cleanup resources', () => {
      const session = sessionManager.createSession('test-presentation-123');
      
      sessionManager.destroy();

      expect(sessionManager.sessions.size).toBe(0);
      expect(sessionManager.presentationSessions.size).toBe(0);
      expect(sessionManager.clientSessions.size).toBe(0);
    });
  });
});