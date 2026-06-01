import { PING_INTERVAL_MS } from './constants.js';

export const socketApi = {
  setupSocket() {
    console.log('[socket] setting up connection');
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('[socket] connected');
      this.isConnected = true;
      if (this.presentationId && this.presentationData) {
        console.log('[socket] auto-rejoining after reconnect');
        this.joinPresentation();
      }
    });

    this.socket.on('disconnect', () => {
      console.log('[socket] disconnected');
      this.isConnected = false;
    });

    this.socket.on('session-joined', (data) => {
      console.log('[socket] joined session:', data);
      console.log('Session data - sessionId:', data.sessionId, 'currentSlide:', data.currentSlide, 'clientCount:', data.clientCount);

      this.isObserver = !data.isPresenter;

      if (!this.presentationData || !Array.isArray(this.slides) || this.slides.length === 0) {
        return;
      }

      const newSlide = typeof data.currentSlide === 'number' && data.currentSlide >= 0 ? data.currentSlide : 0;
      console.log('Setting currentSlide from session:', newSlide);

      if (newSlide !== this.currentSlide) {
        console.log('[socket] updating currentSlide from', this.currentSlide, 'to', newSlide);
        this.currentSlide = newSlide;
        this.displaySlide(this.currentSlide);
      }
      this.clientCount = data.clientCount || 1;
    });

    this.socket.on('slide-updated', (data) => {
      console.log('[socket] slide updated by another client:', data);
      console.log('Remote slide update - slideIndex:', data.slideIndex, 'current:', this.currentSlide);

      if (!this.presentationData || !Array.isArray(this.slides) || this.slides.length === 0) {
        return;
      }

      if (typeof data.slideIndex === 'number' && data.slideIndex !== this.currentSlide) {
        console.log('[socket] applying remote slide change from', this.currentSlide, 'to', data.slideIndex);
        this.currentSlide = data.slideIndex;
        this.displaySlide(this.currentSlide);
      }
    });

    this.socket.on('client-connected', (data) => {
      console.log('[socket] client connected:', data);
      this.clientCount = data.clientCount;
    });

    this.socket.on('client-disconnected', (data) => {
      console.log('[socket] client disconnected:', data);
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
      console.error('[socket] ERROR RECEIVED');
      console.error('Error timestamp:', new Date().toISOString());
      console.error('Error data:', data);
      console.error('Error message:', data.message);
      console.error('Error type:', typeof data);
      console.error('Full error object:', JSON.stringify(data));
      console.error('Current app state:');
      console.error('  - presentationId:', this.presentationId);
      console.error('  - currentSlide:', this.currentSlide);
      console.error('  - totalSlides:', this.totalSlides);
      console.error('  - isConnected:', this.isConnected);
      console.error('  - socket.connected:', this.socket?.connected);
      console.error('  - presentationData loaded:', !!this.presentationData);

      if (data.message && data.message.includes('slide')) {
        console.error('[socket] this appears to be a SLIDE-RELATED error');
        console.error('[socket] possible causes:');
        console.error('   1. Server trying to process old slide change events');
        console.error('   2. Session validation failing on server side');
        console.error('   3. Race condition during connection setup');
        console.error('   4. Server-side cleanup issue from previous session');
      }

      console.error('Stack trace:', new Error().stack);

      this.showError(data.message || 'Connection error occurred');
    });

    console.log('[socket] event listeners registered');
  },

  startConnectionHealthCheck() {
    setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping');
      }
    }, PING_INTERVAL_MS);
  }
};
