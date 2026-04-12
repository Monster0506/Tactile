const Presentation = require('../../src/models/Presentation');

function registerUploadRoute(app, { fileProcessor, storageService, upload }) {
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
}

module.exports = { registerUploadRoute };
