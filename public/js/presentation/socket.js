import { PING_INTERVAL_MS } from './constants.js';

export const socketApi = {
  setupSocket() {
    console.log('🔌 SETTING UP SOCKET CONNECTION');
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      this.isConnected = true;
      if (this.presentationId && this.presentationData) {
        console.log('🔄 Auto-rejoining presentation after reconnect');
        this.joinPresentation();
      }
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      this.isConnected = false;
    });

    this.socket.on('session-joined', (data) => {
      console.log('🎯 Joined presentation session:', data);
      console.log('Session data - sessionId:', data.sessionId, 'currentSlide:', data.currentSlide, 'clientCount:', data.clientCount);

      const newSlide = typeof data.currentSlide === 'number' && data.currentSlide >= 0 ? data.currentSlide : 0;
      console.log('Setting currentSlide from session:', newSlide);

      if (newSlide !== this.currentSlide) {
        console.log('🔄 Updating currentSlide from', this.currentSlide, 'to', newSlide);
        this.currentSlide = newSlide;
        this.displaySlide(this.currentSlide);
      }
      this.clientCount = data.clientCount || 1;
    });

    this.socket.on('slide-updated', (data) => {
      console.log('🔄 Slide updated by another client:', data);
      console.log('Remote slide update - slideIndex:', data.slideIndex, 'current:', this.currentSlide);

      if (typeof data.slideIndex === 'number' && data.slideIndex !== this.currentSlide) {
        console.log('🔄 Applying remote slide change from', this.currentSlide, 'to', data.slideIndex);
        this.currentSlide = data.slideIndex;
        this.displaySlide(this.currentSlide);
      }
    });

    this.socket.on('client-connected', (data) => {
      console.log('👤 Client connected:', data);
      this.clientCount = data.clientCount;
    });

    this.socket.on('client-disconnected', (data) => {
      console.log('👤 Client disconnected:', data);
      this.clientCount = data.clientCount;
    });

    this.socket.on('laser-position', (data) => {
      this.updateLaserPointer(data.x, data.y, data.active);
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
      console.error('🚨 SOCKET ERROR RECEIVED 🚨');
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
        console.error('🎯 This appears to be a SLIDE-RELATED error');
        console.error('🔍 Possible causes:');
        console.error('   1. Server trying to process old slide change events');
        console.error('   2. Session validation failing on server side');
        console.error('   3. Race condition during connection setup');
        console.error('   4. Server-side cleanup issue from previous session');
      }

      console.error('Stack trace:', new Error().stack);

      this.showError(data.message || 'Connection error occurred');
    });

    console.log('🔌 Socket event listeners registered');
  },

  startConnectionHealthCheck() {
    setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping');
      }
    }, PING_INTERVAL_MS);
  }
};
