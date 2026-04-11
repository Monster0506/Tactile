const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const FileProcessor = require('./src/services/FileProcessor');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Initialize FileProcessor
const fileProcessor = new FileProcessor();

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
    
    res.json({
      success: true,
      presentationId: result.presentationId,
      title: result.title,
      totalSlides: result.totalSlides,
      slides: result.slides,
      url: `/presentation/${result.presentationId}`,
      createdAt: result.createdAt
    });
  } catch (error) {
    console.error('File processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-presentation', (presentationId) => {
    socket.join(presentationId);
    console.log(`Client ${socket.id} joined presentation ${presentationId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };