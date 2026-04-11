const fs = require('fs').promises;
const path = require('path');
const StorageService = require('../StorageService');
const Presentation = require('../../models/Presentation');
const Session = require('../../models/Session');

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn()
  }
}));

// Mock models
jest.mock('../../models/Presentation');
jest.mock('../../models/Session');

describe('StorageService', () => {
  let storageService;

  beforeEach(() => {
    storageService = new StorageService();
    jest.clearAllMocks();
    
    // Reset maps
    storageService.presentations.clear();
    storageService.activeSessions.clear();
  });

  describe('initialize', () => {
    it('should create directories and load data', async () => {
      fs.readFile.mockResolvedValue('[]');
      
      await storageService.initialize();
      
      expect(fs.mkdir).toHaveBeenCalledTimes(4); // data, uploads, slides, temp
      expect(fs.readFile).toHaveBeenCalledTimes(2); // presentations and sessions
    });

    it('should handle missing data files gracefully', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.readFile.mockRejectedValue(error);
      
      await expect(storageService.initialize()).resolves.not.toThrow();
    });
  });

  describe('createDirectories', () => {
    it('should create all required directories', async () => {
      await storageService.createDirectories();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('uploads'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('slides'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('temp'),
        { recursive: true }
      );
    });

    it('should handle existing directories', async () => {
      const error = new Error('Directory exists');
      error.code = 'EEXIST';
      fs.mkdir.mockRejectedValue(error);

      await expect(storageService.createDirectories()).resolves.not.toThrow();
    });

    it('should throw error for other mkdir failures', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fs.mkdir.mockRejectedValue(error);

      await expect(storageService.createDirectories()).rejects.toThrow(
        'Failed to create directory'
      );
    });
  });

  describe('presentation management', () => {
    let mockPresentation;

    beforeEach(() => {
      mockPresentation = {
        id: 'test-presentation-id',
        title: 'Test Presentation',
        validate: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
        delete: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ id: 'test-presentation-id' })
      };
      
      // Make mockPresentation pass instanceof check
      Object.setPrototypeOf(mockPresentation, Presentation.prototype);
      
      Presentation.mockImplementation(() => mockPresentation);
    });

    describe('savePresentation', () => {
      it('should save valid presentation', async () => {
        const result = await storageService.savePresentation(mockPresentation);
        
        expect(mockPresentation.validate).toHaveBeenCalled();
        expect(storageService.presentations.get('test-presentation-id')).toBe(mockPresentation);
        expect(fs.writeFile).toHaveBeenCalled();
        expect(result).toBe(mockPresentation);
      });

      it('should reject invalid presentation object', async () => {
        await expect(storageService.savePresentation('not a presentation')).rejects.toThrow(
          'Invalid presentation object'
        );
      });

      it('should reject presentation with validation errors', async () => {
        mockPresentation.validate.mockReturnValue({
          isValid: false,
          errors: ['Test error']
        });

        await expect(storageService.savePresentation(mockPresentation)).rejects.toThrow(
          'Presentation validation failed: Test error'
        );
      });
    });

    describe('getPresentation', () => {
      beforeEach(() => {
        storageService.presentations.set('test-id', mockPresentation);
      });

      it('should return presentation by ID', async () => {
        const result = await storageService.getPresentation('test-id');
        expect(result).toBe(mockPresentation);
      });

      it('should return null for non-existent presentation', async () => {
        const result = await storageService.getPresentation('non-existent');
        expect(result).toBeNull();
      });
    });

    describe('getAllPresentations', () => {
      it('should return all presentations', async () => {
        const presentation1 = { id: 'p1' };
        const presentation2 = { id: 'p2' };
        
        storageService.presentations.set('p1', presentation1);
        storageService.presentations.set('p2', presentation2);
        
        const result = await storageService.getAllPresentations();
        expect(result).toHaveLength(2);
        expect(result).toContain(presentation1);
        expect(result).toContain(presentation2);
      });
    });

    describe('deletePresentation', () => {
      beforeEach(() => {
        storageService.presentations.set('test-id', mockPresentation);
      });

      it('should delete existing presentation', async () => {
        const result = await storageService.deletePresentation('test-id');
        
        expect(result).toBe(true);
        expect(mockPresentation.delete).toHaveBeenCalled();
        expect(storageService.presentations.has('test-id')).toBe(false);
        expect(fs.writeFile).toHaveBeenCalled();
      });

      it('should return false for non-existent presentation', async () => {
        const result = await storageService.deletePresentation('non-existent');
        expect(result).toBe(false);
      });
    });
  });

  describe('session management', () => {
    let mockSession;
    let mockPresentation;

    beforeEach(() => {
      mockSession = {
        sessionId: 'test-session-id',
        presentationId: 'test-presentation-id',
        validate: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
        toJSON: jest.fn().mockReturnValue({ sessionId: 'test-session-id' }),
        isInactive: jest.fn().mockReturnValue(false),
        hasConnectedClients: jest.fn().mockReturnValue(false)
      };

      // Make mockSession pass instanceof check
      Object.setPrototypeOf(mockSession, Session.prototype);

      mockPresentation = {
        id: 'test-presentation-id',
        sessionId: null,
        validate: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
        toJSON: jest.fn().mockReturnValue({ id: 'test-presentation-id' })
      };

      // Make mockPresentation pass instanceof check
      Object.setPrototypeOf(mockPresentation, Presentation.prototype);

      Session.mockImplementation(() => mockSession);
      storageService.presentations.set('test-presentation-id', mockPresentation);
    });

    describe('createSession', () => {
      it('should create session for existing presentation', async () => {
        const result = await storageService.createSession('test-presentation-id');
        
        expect(result).toBe(mockSession);
        expect(mockPresentation.sessionId).toBe('test-session-id');
        expect(storageService.activeSessions.get('test-session-id')).toBe(mockSession);
        expect(fs.writeFile).toHaveBeenCalledTimes(2); // presentations and sessions
      });

      it('should throw error for non-existent presentation', async () => {
        await expect(storageService.createSession('non-existent')).rejects.toThrow(
          'Presentation not found'
        );
      });
    });

    describe('getSession', () => {
      beforeEach(() => {
        storageService.activeSessions.set('test-id', mockSession);
      });

      it('should return session by ID', async () => {
        const result = await storageService.getSession('test-id');
        expect(result).toBe(mockSession);
      });

      it('should return null for non-existent session', async () => {
        const result = await storageService.getSession('non-existent');
        expect(result).toBeNull();
      });
    });

    describe('updateSession', () => {
      it('should update valid session', async () => {
        const result = await storageService.updateSession(mockSession);
        
        expect(mockSession.validate).toHaveBeenCalled();
        expect(storageService.activeSessions.get('test-session-id')).toBe(mockSession);
        expect(fs.writeFile).toHaveBeenCalled();
        expect(result).toBe(mockSession);
      });

      it('should reject invalid session object', async () => {
        await expect(storageService.updateSession('not a session')).rejects.toThrow(
          'Invalid session object'
        );
      });

      it('should reject session with validation errors', async () => {
        mockSession.validate.mockReturnValue({
          isValid: false,
          errors: ['Test error']
        });

        await expect(storageService.updateSession(mockSession)).rejects.toThrow(
          'Session validation failed: Test error'
        );
      });
    });

    describe('deleteSession', () => {
      beforeEach(() => {
        storageService.activeSessions.set('test-session-id', mockSession);
        mockPresentation.sessionId = 'test-session-id';
      });

      it('should delete existing session', async () => {
        const result = await storageService.deleteSession('test-session-id');
        
        expect(result).toBe(true);
        expect(mockPresentation.sessionId).toBeNull();
        expect(storageService.activeSessions.has('test-session-id')).toBe(false);
        expect(fs.writeFile).toHaveBeenCalledTimes(2); // presentations and sessions
      });

      it('should return false for non-existent session', async () => {
        const result = await storageService.deleteSession('non-existent');
        expect(result).toBe(false);
      });
    });

    describe('getActiveSessions', () => {
      it('should return all active sessions', async () => {
        const session1 = { sessionId: 's1' };
        const session2 = { sessionId: 's2' };
        
        storageService.activeSessions.set('s1', session1);
        storageService.activeSessions.set('s2', session2);
        
        const result = await storageService.getActiveSessions();
        expect(result).toHaveLength(2);
        expect(result).toContain(session1);
        expect(result).toContain(session2);
      });
    });

    describe('cleanupInactiveSessions', () => {
      it('should clean up inactive sessions without clients', async () => {
        const inactiveSession = {
          sessionId: 'inactive',
          isInactive: jest.fn().mockReturnValue(true),
          hasConnectedClients: jest.fn().mockReturnValue(false),
          toJSON: jest.fn().mockReturnValue({ sessionId: 'inactive' })
        };
        
        const activeSession = {
          sessionId: 'active',
          isInactive: jest.fn().mockReturnValue(false),
          hasConnectedClients: jest.fn().mockReturnValue(false),
          toJSON: jest.fn().mockReturnValue({ sessionId: 'active' })
        };

        storageService.activeSessions.set('inactive', inactiveSession);
        storageService.activeSessions.set('active', activeSession);
        
        const cleanedCount = await storageService.cleanupInactiveSessions(30);
        
        expect(cleanedCount).toBe(1);
        expect(storageService.activeSessions.has('inactive')).toBe(false);
        expect(storageService.activeSessions.has('active')).toBe(true);
      });

      it('should not clean up inactive sessions with connected clients', async () => {
        const inactiveSessionWithClients = {
          sessionId: 'inactive-with-clients',
          isInactive: jest.fn().mockReturnValue(true),
          hasConnectedClients: jest.fn().mockReturnValue(true)
        };

        storageService.activeSessions.set('inactive-with-clients', inactiveSessionWithClients);
        
        const cleanedCount = await storageService.cleanupInactiveSessions(30);
        
        expect(cleanedCount).toBe(0);
        expect(storageService.activeSessions.has('inactive-with-clients')).toBe(true);
      });
    });
  });

  describe('file operations', () => {
    describe('loadPresentations', () => {
      it('should load presentations from file', async () => {
        const presentationData = [{ id: 'p1', title: 'Presentation 1' }];
        fs.readFile.mockResolvedValue(JSON.stringify(presentationData));
        
        Presentation.fromJSON = jest.fn().mockReturnValue({ id: 'p1' });
        
        await storageService.loadPresentations();
        
        expect(Presentation.fromJSON).toHaveBeenCalledWith(presentationData[0]);
        expect(storageService.presentations.size).toBe(1);
      });

      it('should handle file read errors gracefully', async () => {
        const error = new Error('File not found');
        error.code = 'ENOENT';
        fs.readFile.mockRejectedValue(error);
        
        await expect(storageService.loadPresentations()).resolves.not.toThrow();
      });
    });

    describe('savePresentationsToFile', () => {
      it('should save presentations to file', async () => {
        const presentation = { toJSON: jest.fn().mockReturnValue({ id: 'p1' }) };
        storageService.presentations.set('p1', presentation);
        
        await storageService.savePresentationsToFile();
        
        expect(fs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('presentations.json'),
          expect.stringMatching(/"id"\s*:\s*"p1"/)
        );
      });
    });

    describe('loadSessions', () => {
      it('should load non-expired sessions from file', async () => {
        const sessionData = [{ sessionId: 's1' }];
        fs.readFile.mockResolvedValue(JSON.stringify(sessionData));
        
        const mockSession = { isInactive: jest.fn().mockReturnValue(false) };
        Session.fromJSON = jest.fn().mockReturnValue(mockSession);
        
        await storageService.loadSessions();
        
        expect(Session.fromJSON).toHaveBeenCalledWith(sessionData[0]);
        expect(storageService.activeSessions.size).toBe(1);
      });

      it('should skip expired sessions', async () => {
        const sessionData = [{ sessionId: 's1' }];
        fs.readFile.mockResolvedValue(JSON.stringify(sessionData));
        
        const mockSession = { isInactive: jest.fn().mockReturnValue(true) };
        Session.fromJSON = jest.fn().mockReturnValue(mockSession);
        
        await storageService.loadSessions();
        
        expect(storageService.activeSessions.size).toBe(0);
      });
    });
  });

  describe('utility methods', () => {
    describe('generatePresentationUrl', () => {
      it('should generate correct URL', () => {
        const url = storageService.generatePresentationUrl('test-id');
        expect(url).toBe('/presentation/test-id');
      });
    });

    describe('getStorageStats', () => {
      it('should return storage statistics', async () => {
        const presentation1 = { 
          id: 'p1', 
          getTotalSlides: jest.fn().mockReturnValue(5) 
        };
        const presentation2 = { 
          id: 'p2', 
          getTotalSlides: jest.fn().mockReturnValue(3) 
        };
        
        const session1 = { getClientCount: jest.fn().mockReturnValue(2) };
        const session2 = { getClientCount: jest.fn().mockReturnValue(1) };
        
        storageService.presentations.set('p1', presentation1);
        storageService.presentations.set('p2', presentation2);
        storageService.activeSessions.set('s1', session1);
        storageService.activeSessions.set('s2', session2);
        
        // Mock file system operations
        fs.readdir.mockResolvedValue(['slide1.png', 'slide2.png']);
        fs.stat.mockResolvedValue({ size: 1024 });
        
        const stats = await storageService.getStorageStats();
        
        expect(stats.totalPresentations).toBe(2);
        expect(stats.totalSlides).toBe(8);
        expect(stats.activeSessions).toBe(2);
        expect(stats.connectedClients).toBe(3);
        expect(stats.totalSizeBytes).toBeGreaterThan(0);
      });
    });
  });
});