const { createApplication } = require('./server/bootstrap');

const PORT = process.env.PORT || 3000;

const { app, server, io, storageService, sessionManager } = createApplication();

storageService.initialize().catch(console.error);

const laserPointerInterval = setInterval(() => {
  sessionManager.autoHideLaserPointers();
}, 1000);

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
