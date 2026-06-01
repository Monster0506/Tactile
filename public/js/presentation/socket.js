import { PING_INTERVAL_MS } from './constants.js';

export const socketApi = {
  setupSocket() {
    this.socket = io();

    this.socket.on('connect', () => {
      this.isConnected = true;
      if (this.presentationId && this.presentationData) {
        this.joinPresentation();
      }
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
    });

    this.socket.on('session-joined', (data) => {
      this.isObserver = !data.isPresenter;

      if (!this.presentationData || !Array.isArray(this.slides) || this.slides.length === 0) {
        return;
      }

      const newSlide = typeof data.currentSlide === 'number' && data.currentSlide >= 0 ? data.currentSlide : 0;

      if (newSlide !== this.currentSlide) {
        this.currentSlide = newSlide;
        this.displaySlide(this.currentSlide);
      }
      this.clientCount = data.clientCount || 1;
    });

    this.socket.on('slide-updated', (data) => {
      if (!this.presentationData || !Array.isArray(this.slides) || this.slides.length === 0) {
        return;
      }

      if (typeof data.slideIndex === 'number' && data.slideIndex !== this.currentSlide) {
        this.currentSlide = data.slideIndex;
        this.displaySlide(this.currentSlide);
      }
    });

    this.socket.on('client-connected', (data) => {
      this.clientCount = data.clientCount;
    });

    this.socket.on('client-disconnected', (data) => {
      this.clientCount = data.clientCount;
    });

    this.socket.on('laser-position', (data) => {
      this.updateLaserPointer(data.x, data.y, data.active);
    });

    this.socket.on('laser-trail-point', (data) => {
      this.onRemoteLaserTrailPoint(data);
    });

    this.socket.on('drawing-start', (data) => {
      this.handleRemoteDrawingStart(data);
    });

    this.socket.on('drawing-move', (data) => {
      this.handleRemoteDrawingMove(data);
    });

    this.socket.on('drawing-end', (data) => {
      this.handleRemoteDrawingEnd(data);
    });

    this.socket.on('drawing-clear', (data) => {
      this.handleRemoteDrawingClear(data);
    });

    this.socket.on('error', (data) => {
      this.showError(data.message || 'Connection error occurred');
    });
  },

  startConnectionHealthCheck() {
    setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping');
      }
    }, PING_INTERVAL_MS);
  }
};
