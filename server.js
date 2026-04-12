const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const FileProcessor = require('./src/services/FileProcessor');
const StorageService = require('./src/services/StorageService');
const SessionManager = require('./src/services/SessionManager');
const { createUploadMiddleware } = require('./server/multerConfig');
const { registerHttpRoutes } = require('./server/httpRoutes');
const { attachSocketHandlers } = require('./server/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

const fileProcessor = new FileProcessor();
const storageService = new StorageService();
const sessionManager = new SessionManager(io);
const upload = createUploadMiddleware();

storageService.initialize().catch(console.error);

const laserPointerInterval = setInterval(() => {
  sessionManager.autoHideLaserPointers();
}, 1000);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/slides', express.static('uploads/slides'));

registerHttpRoutes(app, {
  storageService,
  fileProcessor,
  upload,
  sessionManager
});

attachSocketHandlers(io, { sessionManager, storageService });

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

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
