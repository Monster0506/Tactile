const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const FileProcessor = require('../src/services/FileProcessor');
const StorageService = require('../src/services/StorageService');
const SessionManager = require('../src/services/SessionManager');
const { createUploadMiddleware } = require('./multerConfig');
const { registerHttpRoutes } = require('./routes');
const { attachSocketHandlers } = require('./socketHandlers');
const { httpErrorHandler } = require('./middleware/httpErrorHandler');
const { publicDir, uploadsSlides } = require('./paths');

const SOCKET_OPTIONS = {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
};

/**
 * Builds the Express app, HTTP server, Socket.IO, and service singletons.
 * Does not call listen(); entrypoint owns process lifecycle (intervals, signals).
 */
function createApplication() {
  const app = express();
  app.set('trust proxy', 1);
  const server = http.createServer(app);
  const io = socketIo(server, SOCKET_OPTIONS);

  const fileProcessor = new FileProcessor();
  const storageService = new StorageService();
  const sessionManager = new SessionManager(io);
  const upload = createUploadMiddleware();

  app.use(cors());
  app.use(express.json());
  app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(publicDir, 'favicon.svg'));
  });
  app.use(express.static(publicDir));
  app.use('/slides', express.static(uploadsSlides));

  registerHttpRoutes(app, {
    storageService,
    fileProcessor,
    upload,
    sessionManager
  });

  attachSocketHandlers(io, { sessionManager, storageService });

  app.use(httpErrorHandler);

  return {
    app,
    server,
    io,
    fileProcessor,
    storageService,
    sessionManager,
    upload
  };
}

module.exports = { createApplication };
