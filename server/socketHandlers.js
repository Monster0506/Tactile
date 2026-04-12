function createRequireSession(sessionManager) {
  return function requireSession(socket) {
    const sessionId = sessionManager.clientSessions.get(socket.id);
    if (!sessionId) {
      socket.emit('error', { message: 'Not in a session' });
      return null;
    }
    return sessionId;
  };
}

/**
 * @param {import('socket.io').Server} io
 * @param {{ sessionManager: object, storageService: object }} deps
 */
function attachSocketHandlers(io, deps) {
  const { sessionManager, storageService } = deps;
  const requireSession = createRequireSession(sessionManager);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-presentation', async (data) => {
      try {
        const { presentationId, deviceType = 'desktop' } = data;

        const presentation = await storageService.getPresentation(presentationId);
        if (!presentation) {
          socket.emit('error', { message: 'Presentation not found' });
          return;
        }

        let session = sessionManager.getSessionByPresentationId(presentationId);
        if (!session) {
          session = sessionManager.createSession(presentationId);
        }

        const joined = sessionManager.joinSession(session.sessionId, socket.id, deviceType);
        if (joined) {
          const sessionState = sessionManager.getSessionState(session.sessionId);
          socket.emit('session-joined', {
            ...sessionState,
            presentation: {
              id: presentation.id,
              title: presentation.title,
              totalSlides: presentation.getTotalSlides()
            }
          });

          console.log(`Client ${socket.id} (${deviceType}) joined presentation ${presentationId}, session ${session.sessionId}`);
        } else {
          socket.emit('error', { message: 'Failed to join session' });
        }
      } catch (error) {
        console.error('Error joining presentation:', error);
        socket.emit('error', { message: 'Failed to join presentation' });
      }
    });

    socket.on('slide-change', (data) => {
      try {
        const { slideIndex } = data;
        const sessionId = requireSession(socket);
        if (!sessionId) {
          console.error(`No session found for socket ${socket.id}`);
          return;
        }

        const updated = sessionManager.updateSlide(sessionId, slideIndex, socket.id);
        if (!updated) {
          socket.emit('error', { message: 'Failed to update slide' });
        }
      } catch (error) {
        console.error('Error changing slide:', error);
        socket.emit('error', { message: 'Failed to change slide' });
      }
    });

    socket.on('slide-next', () => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        const session = sessionManager.getSession(sessionId);
        if (session) {
          const nextSlide = session.getCurrentSlide() + 1;
          sessionManager.updateSlide(sessionId, nextSlide, socket.id);
        }
      } catch (error) {
        console.error('Error navigating to next slide:', error);
        socket.emit('error', { message: 'Failed to navigate to next slide' });
      }
    });

    socket.on('slide-previous', () => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        const session = sessionManager.getSession(sessionId);
        if (session) {
          const prevSlide = Math.max(0, session.getCurrentSlide() - 1);
          sessionManager.updateSlide(sessionId, prevSlide, socket.id);
        }
      } catch (error) {
        console.error('Error navigating to previous slide:', error);
        socket.emit('error', { message: 'Failed to navigate to previous slide' });
      }
    });

    socket.on('laser-pointer', (data) => {
      try {
        const { x, y, active } = data;
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        if (active) {
          sessionManager.updateLaserPointer(sessionId, x, y, true, socket.id);
        } else {
          sessionManager.deactivateLaserPointer(sessionId, socket.id);
        }
      } catch (error) {
        console.error('Error updating laser pointer:', error);
        socket.emit('error', { message: 'Failed to update laser pointer' });
      }
    });

    socket.on('laser-trail-point', (data) => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;
        const x = data?.x;
        const y = data?.y;
        if (typeof x !== 'number' || typeof y !== 'number') return;
        const t = typeof data?.t === 'number' ? data.t : Date.now();
        sessionManager.handleLaserTrailPoint(sessionId, { x, y, t }, socket.id);
      } catch (error) {
        console.error('Error relaying laser trail point:', error);
        socket.emit('error', { message: 'Failed to relay laser trail' });
      }
    });

    socket.on('drawing-data', (data) => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        sessionManager.syncDrawing(sessionId, data, socket.id);
      } catch (error) {
        console.error('Error syncing drawing:', error);
        socket.emit('error', { message: 'Failed to sync drawing' });
      }
    });

    socket.on('drawing-start', (data) => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        sessionManager.handleDrawingStart(sessionId, data, socket.id);
      } catch (error) {
        console.error('Error handling drawing start:', error);
        socket.emit('error', { message: 'Failed to handle drawing start' });
      }
    });

    socket.on('drawing-move', (data) => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        sessionManager.handleDrawingMove(sessionId, data, socket.id);
      } catch (error) {
        console.error('Error handling drawing move:', error);
        socket.emit('error', { message: 'Failed to handle drawing move' });
      }
    });

    socket.on('drawing-end', (data) => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        sessionManager.handleDrawingEnd(sessionId, data, socket.id);
      } catch (error) {
        console.error('Error handling drawing end:', error);
        socket.emit('error', { message: 'Failed to handle drawing end' });
      }
    });

    socket.on('drawing-clear', (data) => {
      try {
        const sessionId = requireSession(socket);
        if (!sessionId) return;

        sessionManager.handleDrawingClear(sessionId, data, socket.id);
      } catch (error) {
        console.error('Error handling drawing clear:', error);
        socket.emit('error', { message: 'Failed to handle drawing clear' });
      }
    });

    socket.on('disconnect', () => {
      try {
        console.log('Client disconnected:', socket.id);
        sessionManager.leaveSession(socket.id);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });
  });
}

module.exports = { attachSocketHandlers, createRequireSession };
