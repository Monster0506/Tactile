function registerPresentationApiRoutes(app, { storageService }) {
  app.get('/api/presentation/:id', async (req, res) => {
    try {
      const presentationId = req.params.id;
      let presentation = await storageService.getPresentation(presentationId);

      if (!presentation) {
        return res.status(404).json({ error: 'Presentation not found' });
      }

      await storageService.rehydrateSlidesFromDiskIfEmpty(presentationId);
      presentation = await storageService.getPresentation(presentationId);

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
}

module.exports = { registerPresentationApiRoutes };
