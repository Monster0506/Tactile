const Session = require('../Session');

describe('Session Model', () => {
  let session;

  beforeEach(() => {
    session = new Session({ presentationId: 'test-presentation' });
  });

  describe('constructor', () => {
    it('should create session with default values', () => {
      expect(session.sessionId).toBeDefined();
      expect(session.presentationId).toBe('test-presentation');
      expect(session.currentSlide).toBe(0);
      expect(session.connectedClients).toEqual([]);
      expect(session.laserPointer).toEqual({
        x: 0,
        y: 0,
        active: false,
        lastUpdate: null
      });
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
    });

    it('should create session with provided data', () => {
      const data = {
        sessionId: 'custom-session-id',
        presentationId: 'test-presentation',
        currentSlide: 5,
        connectedClients: [{ socketId: 'socket1', deviceType: 'mobile' }]
      };

      const customSession = new Session(data);
      expect(customSession.sessionId).toBe('custom-session-id');
      expect(customSession.currentSlide).toBe(5);
      expect(customSession.connectedClients).toHaveLength(1);
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = session.generateSessionId();
      const id2 = session.generateSessionId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBe(24); // 12 bytes * 2 hex chars
    });
  });

  describe('client management', () => {
    describe('addClient', () => {
      it('should add client to session', () => {
        const client = session.addClient('socket123', 'desktop');
        
        expect(client.socketId).toBe('socket123');
        expect(client.deviceType).toBe('desktop');
        expect(client.joinedAt).toBeInstanceOf(Date);
        expect(session.connectedClients).toHaveLength(1);
        expect(session.connectedClients[0]).toBe(client);
      });

      it('should default to desktop device type', () => {
        const client = session.addClient('socket123');
        expect(client.deviceType).toBe('desktop');
      });

      it('should remove existing client with same socket ID', () => {
        session.addClient('socket123', 'desktop');
        session.addClient('socket456', 'mobile');
        
        expect(session.connectedClients).toHaveLength(2);
        
        // Add client with existing socket ID
        session.addClient('socket123', 'mobile');
        
        expect(session.connectedClients).toHaveLength(2);
        const client = session.getClient('socket123');
        expect(client.deviceType).toBe('mobile');
      });
    });

    describe('removeClient', () => {
      beforeEach(() => {
        session.addClient('socket123', 'desktop');
        session.addClient('socket456', 'mobile');
      });

      it('should remove client by socket ID', () => {
        const removed = session.removeClient('socket123');
        
        expect(removed).toBe(true);
        expect(session.connectedClients).toHaveLength(1);
        expect(session.getClient('socket123')).toBeNull();
        expect(session.getClient('socket456')).toBeDefined();
      });

      it('should return false for non-existent client', () => {
        const removed = session.removeClient('non-existent');
        expect(removed).toBe(false);
        expect(session.connectedClients).toHaveLength(2);
      });
    });

    describe('getClient', () => {
      beforeEach(() => {
        session.addClient('socket123', 'desktop');
      });

      it('should return client by socket ID', () => {
        const client = session.getClient('socket123');
        expect(client).toBeDefined();
        expect(client.socketId).toBe('socket123');
      });

      it('should return null for non-existent client', () => {
        const client = session.getClient('non-existent');
        expect(client).toBeNull();
      });
    });

    describe('getConnectedClients', () => {
      it('should return copy of connected clients array', () => {
        session.addClient('socket123', 'desktop');
        session.addClient('socket456', 'mobile');
        
        const clients = session.getConnectedClients();
        expect(clients).toHaveLength(2);
        
        // Modifying returned array should not affect original
        clients.push({ socketId: 'fake' });
        expect(session.connectedClients).toHaveLength(2);
      });
    });

    describe('getClientCount', () => {
      it('should return correct client count', () => {
        expect(session.getClientCount()).toBe(0);
        
        session.addClient('socket123');
        expect(session.getClientCount()).toBe(1);
        
        session.addClient('socket456');
        expect(session.getClientCount()).toBe(2);
        
        session.removeClient('socket123');
        expect(session.getClientCount()).toBe(1);
      });
    });

    describe('getClientsByDeviceType', () => {
      beforeEach(() => {
        session.addClient('desktop1', 'desktop');
        session.addClient('desktop2', 'desktop');
        session.addClient('mobile1', 'mobile');
      });

      it('should return clients by device type', () => {
        const desktopClients = session.getClientsByDeviceType('desktop');
        const mobileClients = session.getClientsByDeviceType('mobile');
        
        expect(desktopClients).toHaveLength(2);
        expect(mobileClients).toHaveLength(1);
        expect(desktopClients[0].deviceType).toBe('desktop');
        expect(mobileClients[0].deviceType).toBe('mobile');
      });
    });
  });

  describe('slide management', () => {
    describe('updateCurrentSlide', () => {
      it('should update current slide with valid index', () => {
        const updated = session.updateCurrentSlide(5);
        
        expect(updated).toBe(true);
        expect(session.getCurrentSlide()).toBe(5);
      });

      it('should reject negative slide index', () => {
        const updated = session.updateCurrentSlide(-1);
        
        expect(updated).toBe(false);
        expect(session.getCurrentSlide()).toBe(0);
      });

      it('should reject non-number slide index', () => {
        const updated = session.updateCurrentSlide('invalid');
        
        expect(updated).toBe(false);
        expect(session.getCurrentSlide()).toBe(0);
      });
    });

    describe('getCurrentSlide', () => {
      it('should return current slide index', () => {
        expect(session.getCurrentSlide()).toBe(0);
        
        session.updateCurrentSlide(3);
        expect(session.getCurrentSlide()).toBe(3);
      });
    });
  });

  describe('laser pointer management', () => {
    describe('updateLaserPointer', () => {
      it('should update laser pointer position and state', () => {
        session.updateLaserPointer(100, 200, true);
        
        const laserPointer = session.getLaserPointer();
        expect(laserPointer.x).toBe(100);
        expect(laserPointer.y).toBe(200);
        expect(laserPointer.active).toBe(true);
        expect(laserPointer.lastUpdate).toBeInstanceOf(Date);
      });

      it('should default to active state', () => {
        session.updateLaserPointer(50, 75);
        
        const laserPointer = session.getLaserPointer();
        expect(laserPointer.active).toBe(true);
      });

      it('should handle invalid coordinates', () => {
        session.updateLaserPointer('invalid', null, true);
        
        const laserPointer = session.getLaserPointer();
        expect(laserPointer.x).toBe(0);
        expect(laserPointer.y).toBe(0);
        expect(laserPointer.active).toBe(true);
      });
    });

    describe('deactivateLaserPointer', () => {
      it('should deactivate laser pointer', () => {
        session.updateLaserPointer(100, 200, true);
        session.deactivateLaserPointer();
        
        const laserPointer = session.getLaserPointer();
        expect(laserPointer.active).toBe(false);
        expect(laserPointer.lastUpdate).toBeInstanceOf(Date);
      });
    });

    describe('getLaserPointer', () => {
      it('should return copy of laser pointer state', () => {
        session.updateLaserPointer(100, 200, true);
        
        const laserPointer = session.getLaserPointer();
        expect(laserPointer.x).toBe(100);
        expect(laserPointer.y).toBe(200);
        expect(laserPointer.active).toBe(true);
        
        // Modifying returned object should not affect original
        laserPointer.x = 999;
        expect(session.laserPointer.x).toBe(100);
      });
    });

    describe('shouldAutoHideLaserPointer', () => {
      it('should return false for inactive laser pointer', () => {
        session.deactivateLaserPointer();
        expect(session.shouldAutoHideLaserPointer()).toBe(false);
      });

      it('should return false for recently updated laser pointer', () => {
        session.updateLaserPointer(100, 200, true);
        expect(session.shouldAutoHideLaserPointer()).toBe(false);
      });

      it('should return true for old laser pointer update', () => {
        session.updateLaserPointer(100, 200, true);
        
        // Manually set old timestamp
        const fourSecondsAgo = new Date(Date.now() - 4000);
        session.laserPointer.lastUpdate = fourSecondsAgo;
        
        expect(session.shouldAutoHideLaserPointer()).toBe(true);
      });

      it('should return false for laser pointer without lastUpdate', () => {
        session.laserPointer.active = true;
        session.laserPointer.lastUpdate = null;
        
        expect(session.shouldAutoHideLaserPointer()).toBe(false);
      });
    });
  });

  describe('activity tracking', () => {
    describe('updateLastActivity', () => {
      it('should update last activity timestamp', () => {
        const oldActivity = session.lastActivity;
        
        // Wait a bit to ensure timestamp difference
        setTimeout(() => {
          session.updateLastActivity();
          expect(session.lastActivity).not.toBe(oldActivity);
          expect(session.lastActivity).toBeInstanceOf(Date);
        }, 10);
      });
    });

    describe('isInactive', () => {
      it('should return false for recent activity', () => {
        session.updateLastActivity();
        expect(session.isInactive(30)).toBe(false);
      });

      it('should return true for old activity', () => {
        const oldTime = new Date(Date.now() - (35 * 60 * 1000)); // 35 minutes ago
        session.lastActivity = oldTime;
        
        expect(session.isInactive(30)).toBe(true);
      });

      it('should use custom inactivity threshold', () => {
        const oldTime = new Date(Date.now() - (10 * 60 * 1000)); // 10 minutes ago
        session.lastActivity = oldTime;
        
        expect(session.isInactive(5)).toBe(true);
        expect(session.isInactive(15)).toBe(false);
      });
    });

    describe('hasConnectedClients', () => {
      it('should return false for no clients', () => {
        expect(session.hasConnectedClients()).toBe(false);
      });

      it('should return true for connected clients', () => {
        session.addClient('socket123');
        expect(session.hasConnectedClients()).toBe(true);
      });
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize and deserialize correctly', () => {
      session.addClient('socket123', 'desktop');
      session.updateCurrentSlide(3);
      session.updateLaserPointer(100, 200, true);

      const json = session.toJSON();
      const restored = Session.fromJSON(json);

      expect(restored.sessionId).toBe(session.sessionId);
      expect(restored.presentationId).toBe(session.presentationId);
      expect(restored.currentSlide).toBe(session.currentSlide);
      expect(restored.connectedClients).toEqual(session.connectedClients);
      expect(restored.laserPointer).toEqual(session.laserPointer);
      expect(restored.createdAt).toEqual(session.createdAt);
      expect(restored.lastActivity).toEqual(session.lastActivity);
    });
  });

  describe('validate', () => {
    it('should validate correct session', () => {
      session.addClient('socket123', 'desktop');
      
      const result = session.validate();
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required fields', () => {
      session.sessionId = null;
      session.presentationId = null;
      session.currentSlide = -1;

      const result = session.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session ID is required and must be a string');
      expect(result.errors).toContain('Presentation ID is required and must be a string');
      expect(result.errors).toContain('Current slide must be a non-negative number');
    });

    it('should validate connected clients', () => {
      session.connectedClients = [
        { socketId: null, deviceType: 'desktop' },
        { socketId: 'socket2', deviceType: 'invalid' }
      ];

      const result = session.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Client 0: socketId is required and must be a string');
      expect(result.errors).toContain('Client 1: deviceType must be \'desktop\' or \'mobile\'');
    });

    it('should validate laser pointer', () => {
      session.laserPointer = {
        x: 'invalid',
        y: null,
        active: 'not boolean'
      };

      const result = session.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Laser pointer x coordinate must be a number');
      expect(result.errors).toContain('Laser pointer y coordinate must be a number');
      expect(result.errors).toContain('Laser pointer active state must be a boolean');
    });

    it('should detect invalid data types', () => {
      session.connectedClients = 'not an array';
      session.laserPointer = 'not an object';

      const result = session.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Connected clients must be an array');
      expect(result.errors).toContain('Laser pointer must be an object');
    });
  });
});