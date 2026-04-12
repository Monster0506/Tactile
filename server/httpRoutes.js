const path = require('path');
const Presentation = require('../src/models/Presentation');

/**
 * @param {import('express').Application} app
 * @param {{ storageService: object, fileProcessor: object, upload: import('multer').Multer }} deps
 */
function registerHttpRoutes(app, deps) {
  const { storageService, fileProcessor, upload } = deps;

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.get('/presentation/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'presentation.html'));
  });

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

  app.post('/upload', upload.single('presentation'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const isValid = await fileProcessor.validateFile(req.file.path, req.file.originalname);
      if (!isValid) {
        return res.status(400).json({
          error: 'Invalid file format or size',
          supportedFormats: fileProcessor.getSupportedFormats(),
          maxSize: `${fileProcessor.getMaxFileSize() / (1024 * 1024)}MB`
        });
      }

      const result = await fileProcessor.processFile(req.file.path, req.file.originalname);

      const presentation = new Presentation({
        id: result.presentationId,
        title: result.title,
        slides: result.slides,
        createdAt: new Date(result.createdAt)
      });

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

  app.get('/api/sessions/stats', (req, res) => {
    try {
      const stats = deps.sessionManager.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting session stats:', error);
      res.status(500).json({ error: 'Failed to get session statistics' });
    }
  });
}

module.exports = { registerHttpRoutes };
