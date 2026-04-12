const { registerPageRoutes } = require('./pages');
const { registerPresentationApiRoutes } = require('./presentationApi');
const { registerUploadRoute } = require('./uploadRoute');
const { registerSessionsApiRoutes } = require('./sessionsApi');

/**
 * Registers all HTTP routes. Order: static pages, JSON APIs, upload.
 *
 * @param {import('express').Application} app
 * @param {{ storageService: object, fileProcessor: object, upload: import('multer').Multer, sessionManager: object }} deps
 */
function registerHttpRoutes(app, deps) {
  registerPageRoutes(app);
  registerPresentationApiRoutes(app, deps);
  registerUploadRoute(app, deps);
  registerSessionsApiRoutes(app, deps);
}

module.exports = { registerHttpRoutes };
