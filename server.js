const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const FileProcessor = require('./src/services/FileProcessor');
const StorageService = require('./src/services/StorageService');
const SessionManager = require('./src/services/SessionManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Initialize services
const fileProcessor = new FileProcessor();
const storageService = new StorageService();
const sessionManager = new SessionManager(io);

// Initialize storage service
storageService.initialize().catch(console.error);

// Auto-hide laser pointers every second
const laserPointerInterval = setInterval(() => {
  sessionManager.autoHideLaserPointers();
}, 1000);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/slides', express.static('uploads/slides'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/temp/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.pdf', '.ppt', '.pptx', '.md'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Supported formats: PDF, PowerPoint, Markdown'));
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/presentation/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presentation.html'));
});

// API endpoint to get presentation data
app.get('/api/presentation/:id', async (req, res) => {
  try {
    const presentationId = req.params.id;
    const presentation = await storageService.getPresentation(presentationId);
    
    if (!presentation) {
      return res.status(404).json({ error: 'Presentation not found' });
    }
    
    res.json({
      id: presentation.id,
      title: presentation.title,
      slides: presentation.slides,
      totalSlides: presentation.getTotalSlides(),
      createdAt: presentation.createdAt
    });
  } catch (error) {
    console.error('Error fetching presentation:', error);
    res.status(500).json({ error: 'Failed to fetch presentation' });
  }
});

// File upload endpoint
app.post('/upload', upload.single('presentation'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file using FileProcessor
    const isValid = await fileProcessor.validateFile(req.file.path, req.file.originalname);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'Invalid file format or size',
        supportedFormats: fileProcessor.getSupportedFormats(),
        maxSize: `${fileProcessor.getMaxFileSize() / (1024 * 1024)}MB`
      });
    }

    // Process the file
    const result = await fileProcessor.processFile(req.file.path, req.file.originalname);
    
    // Create Presentation object from FileProcessor result
    const Presentation = require('./src/models/Presentation');
    const presentation = new Presentation({
      id: result.presentationId,
      title: result.title,
      slides: result.slides,
      createdAt: new Date(result.createdAt)
    });
    
    // Save presentation using StorageService
    const savedPresentation = await storageService.savePresentation(presentation);
    
    res.json({
      success: true,
      presentationId: savedPresentation.id,
      title: savedPresentation.title,
      totalSlides: savedPresentation.getTotalSlides(),
      slides: savedPresentation.slides,
      url: `/presentation/${savedPresentation.id}`,
      createdAt: savedPresentation.createdAt
    });
  } catch (error) {
    console.error('File processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling with session management
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle client joining a presentation
  socket.on('join-presentation', async (data) => {
    try {
      const { presentationId, deviceType = 'desktop' } = data;
      
      // Verify presentation exists
      const presentation = await storageService.getPresentation(presentationId);
      if (!presentation) {
        socket.emit('error', { message: 'Presentation not found' });
        return;
      }

      // Get or create session for this presentation
      let session = sessionManager.getSessionByPresentationId(presentationId);
      if (!session) {
        session = sessionManager.createSession(presentationId);
      }

      // Join client to session
      const joined = sessionManager.joinSession(session.sessionId, socket.id, deviceType);
      if (joined) {
        // Send current session state to the new client
        const sessionState = sessionManager.getSessionState(session.sessionId);
        socket.emit('session-joined', {
          ...sessionState,
          presentation: {
            id: presentation.id,
            title: presentation.title,
            totalSlides: presentation.getTotalSlides()
          }
        });

        console.log(`Client ${socket.id} (${deviceType}) joined presentation ${presentationId}, session ${session.sessionId}`);
      } else {
        socket.emit('error', { message: 'Failed to join session' });
      }
    } catch (error) {
      console.error('Error joining presentation:', error);
      socket.emit('error', { message: 'Failed to join presentation' });
    }
  });

  // Handle slide navigation
  socket.on('slide-change', (data) => {
    try {
      const { slideIndex } = data;
      const sessionId = sessionManager.clientSessions.get(socket.id);
      
      if (!sessionId) {
        socket.emit('error', { message: 'Not in a session' });
        return;
      }

      const updated = sessionManager.updateSlide(sessionId, slideIndex, socket.id);
      if (!updated) {
        socket.emit('error', { message: 'Failed to update slide' });
      }
    } catch (error) {
      console.error('Error changing slide:', error);
      socket.emit('error', { message: 'Failed to change slide' });
    }
  });

  // Handle next slide navigation
  socket.on('slide-next', () => {
    try {
      const sessionId = sessionManager.clientSessions.get(socket.id);
      if (!sessionId) {
        socket.emit('error', { message: 'Not in a session' });
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (session) {
        const nextSlide = session.getCurrentSlide() + 1;
        sessionManager.updateSlide(sessionId, nextSlide, socket.id);
      }
    } catch (error) {
      console.error('Error navigating to next slide:', error);
      socket.emit('error', { message: 'Failed to navigate to next slide' });
    }
  });

  // Handle previous slide navigation
  socket.on('slide-previous', () => {
    try {
      const sessionId = sessionManager.clientSessions.get(socket.id);
      if (!sessionId) {
        socket.emit('error', { message: 'Not in a session' });
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (session) {
        const prevSlide = Math.max(0, session.getCurrentSlide() - 1);
        sessionManager.updateSlide(sessionId, prevSlide, socket.id);
      }
    } catch (error) {
      console.error('Error navigating to previous slide:', error);
      socket.emit('error', { message: 'Failed to navigate to previous slide' });
    }
  });

  // Handle laser pointer updates
  socket.on('laser-pointer', (data) => {
    try {
      const { x, y, active } = data;
      const sessionId = sessionManager.clientSessions.get(socket.id);
      
      if (!sessionId) {
        socket.emit('error', { message: 'Not in a session' });
        return;
      }

      if (active) {
        sessionManager.updateLaserPointer(sessionId, x, y, true, socket.id);
      } else {
        sessionManager.deactivateLaserPointer(sessionId, socket.id);
      }
    } catch (error) {
      console.error('Error updating laser pointer:', error);
      socket.emit('error', { message: 'Failed to update laser pointer' });
    }
  });

  // Handle drawing synchronization
  socket.on('drawing-data', (data) => {
    try {
      const sessionId = sessionManager.clientSessions.get(socket.id);
      
      if (!sessionId) {
        socket.emit('error', { message: 'Not in a session' });
        return;
      }

      // Broadcast drawing data to other clients in the session
      sessionManager.syncDrawing(sessionId, data, socket.id);
    } catch (error) {
      console.error('Error syncing drawing:', error);
      socket.emit('error', { message: 'Failed to sync drawing' });
    }
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    try {
      console.log('Client disconnected:', socket.id);
      sessionManager.leaveSession(socket.id);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  // Handle ping for connection health check
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

// API endpoint to get session statistics
app.get('/api/sessions/stats', (req, res) => {
  try {
    const stats = sessionManager.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting session stats:', error);
    res.status(500).json({ error: 'Failed to get session statistics' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  cleanup();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  cleanup();
});

function cleanup() {
  if (laserPointerInterval) {
    clearInterval(laserPointerInterval);
  }
  
  if (sessionManager) {
    sessionManager.destroy();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

module.exports = { app, server, io, sessionManager };