function registerSessionsApiRoutes(app, { sessionManager }) {
  app.get('/api/sessions/stats', (req, res) => {
    try {
      const stats = sessionManager.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting session stats:', error);
      res.status(500).json({ error: 'Failed to get session statistics' });
    }
  });
}

module.exports = { registerSessionsApiRoutes };
