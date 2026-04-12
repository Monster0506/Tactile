const path = require('path');
const { publicDir } = require('../paths');

function registerPageRoutes(app) {
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/presentation/:id', (req, res) => {
    res.sendFile(path.join(publicDir, 'presentation.html'));
  });
}

module.exports = { registerPageRoutes };
