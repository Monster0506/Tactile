export const drawing = {
  initializeDrawing() {
    if (this.$refs.drawingCanvas) {
      const canvas = this.$refs.drawingCanvas;
      this.drawing.ctx = canvas.getContext('2d');
      this.setupDrawingCanvas();
      this.setupDrawingEvents();
    }

    if (this.$refs.mobileDrawingCanvas) {
      const mobileCanvas = this.$refs.mobileDrawingCanvas;
      this.drawing.mobileCtx = mobileCanvas.getContext('2d');
      this.setupMobileDrawingCanvas();
      this.setupMobileDrawingEvents();
    }
  },

  setupDrawingCanvas() {
    const canvas = this.$refs.drawingCanvas;
    if (!canvas) return;

    this.resizeDrawingCanvas();

    this.drawing.ctx.lineCap = 'round';
    this.drawing.ctx.lineJoin = 'round';
    this.drawing.ctx.globalCompositeOperation = 'source-over';

    window.addEventListener('resize', () => this.resizeDrawingCanvas());
  },

  setupMobileDrawingCanvas() {
    const canvas = this.$refs.mobileDrawingCanvas;
    if (!canvas) return;

    this.resizeMobileDrawingCanvas();

    this.drawing.mobileCtx.lineCap = 'round';
    this.drawing.mobileCtx.lineJoin = 'round';
    this.drawing.mobileCtx.globalCompositeOperation = 'source-over';

    window.addEventListener('resize', () => this.resizeMobileDrawingCanvas());
  },

  resizeDrawingCanvas() {
    const canvas = this.$refs.drawingCanvas;
    const slideDisplay = document.getElementById('slideDisplay');
    if (!canvas || !slideDisplay) return;

    const rect = slideDisplay.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    this.redrawCurrentSlide();
  },

  resizeMobileDrawingCanvas() {
    const canvas = this.$refs.mobileDrawingCanvas;
    const slidePreview = document.querySelector('.mobile-slide-preview');
    if (!canvas || !slidePreview) return;

    const rect = slidePreview.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    this.redrawCurrentSlide();
  },

  setupDrawingEvents() {
    const canvas = this.$refs.drawingCanvas;
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    canvas.addEventListener('mousemove', (e) => this.draw(e));
    canvas.addEventListener('mouseup', () => this.stopDrawing());
    canvas.addEventListener('mouseout', () => this.stopDrawing());

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      canvas.dispatchEvent(mouseEvent);
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      canvas.dispatchEvent(mouseEvent);
    });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const mouseEvent = new MouseEvent('mouseup', {});
      canvas.dispatchEvent(mouseEvent);
    });
  },

  setupMobileDrawingEvents() {
    const canvas = this.$refs.mobileDrawingCanvas;
    if (!canvas) return;

    canvas.addEventListener('touchstart', (e) => {
      if (!this.drawing.isDrawingMode) return;
      e.preventDefault();
      e.stopPropagation();
      this.startMobileDrawing(e);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!this.drawing.isDrawingMode) return;
      e.preventDefault();
      e.stopPropagation();
      this.drawMobile(e);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (!this.drawing.isDrawingMode) return;
      e.preventDefault();
      e.stopPropagation();
      this.stopDrawing();
    }, { passive: false });
  },

  toggleDrawingMode() {
    this.drawing.isDrawingMode = !this.drawing.isDrawingMode;
    this.drawing.toolbarVisible = this.drawing.isDrawingMode;

    const canvas = this.$refs.drawingCanvas;
    if (canvas) {
      canvas.style.pointerEvents = this.drawing.isDrawingMode ? 'auto' : 'none';
    }

    if (!this.drawing.isDrawingMode) {
      this.stopDrawing();
    }
  },

  toggleMobileDrawing() {
    this.drawing.isDrawingMode = !this.drawing.isDrawingMode;

    const canvas = this.$refs.mobileDrawingCanvas;
    if (canvas) {
      canvas.style.pointerEvents = this.drawing.isDrawingMode ? 'auto' : 'none';
    }

    if (!this.drawing.isDrawingMode) {
      this.stopDrawing();
    }

    this.provideTactileFeedback();
  },

  setDrawingTool(tool) {
    this.drawing.currentTool = tool;
  },

  setDrawingColor(color) {
    this.drawing.currentColor = color;
  },

  updateDrawingColor() {},

  updateBrushSize() {},

  getRelativePosition(e) {
    const canvas = this.isMobile ? this.$refs.mobileDrawingCanvas : this.$refs.drawingCanvas;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    };
  },

  getMobileRelativePosition(e) {
    const canvas = this.$refs.mobileDrawingCanvas;
    if (!canvas) return { x: 0, y: 0 };

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height
    };
  },

  startMobileDrawing(e) {
    if (!this.drawing.isDrawingMode) return;

    this.drawing.isDrawing = true;
    const pos = this.getMobileRelativePosition(e);
    this.drawing.lastPoint = pos;

    this.drawing.currentStroke = {
      id: this.generateStrokeId(),
      slideId: this.getCurrentSlideId(),
      points: [pos],
      color: this.drawing.currentColor,
      width: this.drawing.currentWidth,
      tool: this.drawing.currentTool,
      timestamp: new Date().toISOString()
    };

    this.socket.emit('drawing-start', {
      strokeId: this.drawing.currentStroke.id,
      slideId: this.drawing.currentStroke.slideId,
      x: pos.x,
      y: pos.y,
      color: this.drawing.currentColor,
      width: this.drawing.currentWidth,
      tool: this.drawing.currentTool
    });
  },

  drawMobile(e) {
    if (!this.drawing.isDrawing || !this.drawing.isDrawingMode || !this.drawing.currentStroke) return;

    const pos = this.getMobileRelativePosition(e);
    this.drawing.currentStroke.points.push(pos);

    this.drawMobileLine(this.drawing.lastPoint, pos, this.drawing.currentColor, this.drawing.currentWidth, this.drawing.currentTool);
    this.drawing.lastPoint = pos;

    this.socket.emit('drawing-move', {
      strokeId: this.drawing.currentStroke.id,
      x: pos.x,
      y: pos.y
    });
  },

  startDrawing(e) {
    if (!this.drawing.isDrawingMode) return;

    this.drawing.isDrawing = true;
    const pos = this.getRelativePosition(e);
    this.drawing.lastPoint = pos;

    this.drawing.currentStroke = {
      id: this.generateStrokeId(),
      slideId: this.getCurrentSlideId(),
      points: [pos],
      color: this.drawing.currentColor,
      width: this.drawing.currentWidth,
      tool: this.drawing.currentTool,
      timestamp: new Date().toISOString()
    };

    this.socket.emit('drawing-start', {
      strokeId: this.drawing.currentStroke.id,
      slideId: this.drawing.currentStroke.slideId,
      x: pos.x,
      y: pos.y,
      color: this.drawing.currentColor,
      width: this.drawing.currentWidth,
      tool: this.drawing.currentTool
    });
  },

  draw(e) {
    if (!this.drawing.isDrawing || !this.drawing.isDrawingMode || !this.drawing.currentStroke) return;

    const pos = this.getRelativePosition(e);
    this.drawing.currentStroke.points.push(pos);

    this.drawLine(this.drawing.lastPoint, pos, this.drawing.currentColor, this.drawing.currentWidth, this.drawing.currentTool);
    this.drawing.lastPoint = pos;

    this.socket.emit('drawing-move', {
      strokeId: this.drawing.currentStroke.id,
      x: pos.x,
      y: pos.y
    });
  },

  stopDrawing() {
    if (!this.drawing.isDrawing || !this.drawing.currentStroke) return;

    this.drawing.isDrawing = false;

    const slideId = this.getCurrentSlideId();
    if (!this.drawing.slideDrawings.has(slideId)) {
      this.drawing.slideDrawings.set(slideId, []);
    }
    this.drawing.slideDrawings.get(slideId).push(this.drawing.currentStroke);

    this.socket.emit('drawing-end', {
      strokeId: this.drawing.currentStroke.id,
      strokeData: this.drawing.currentStroke
    });

    this.drawing.currentStroke = null;
    this.drawing.lastPoint = null;
  },

  strokeSegment(ctx, canvas, from, to, color, width, tool) {
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fromPixel = { x: from.x * rect.width, y: from.y * rect.height };
    const toPixel = { x: to.x * rect.width, y: to.y * rect.height };
    ctx.save();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(fromPixel.x, fromPixel.y);
    ctx.lineTo(toPixel.x, toPixel.y);
    ctx.stroke();
    ctx.restore();
  },

  drawLine(from, to, color, width, tool) {
    const canvas = this.$refs.drawingCanvas;
    this.strokeSegment(this.drawing.ctx, canvas, from, to, color, width, tool);
  },

  drawMobileLine(from, to, color, width, tool) {
    const canvas = this.$refs.mobileDrawingCanvas;
    this.strokeSegment(this.drawing.mobileCtx, canvas, from, to, color, width, tool);
  },

  drawStroke(stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    const segment = this.isMobile ? this.drawMobileLine.bind(this) : this.drawLine.bind(this);
    for (let i = 1; i < stroke.points.length; i++) {
      segment(stroke.points[i - 1], stroke.points[i], stroke.color, stroke.width, stroke.tool);
    }
  },

  redrawCurrentSlide() {
    if (this.isMobile) {
      if (!this.drawing.mobileCtx) return;
      this.clearMobileCanvas();
    } else {
      if (!this.drawing.ctx) return;
      this.clearCanvas();
    }

    const slideId = this.getCurrentSlideId();
    const strokes = this.drawing.slideDrawings.get(slideId) || [];
    strokes.forEach((stroke) => this.drawStroke(stroke));
  },

  clearCanvas() {
    const canvas = this.$refs.drawingCanvas;
    if (canvas && this.drawing.ctx) {
      this.drawing.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  },

  clearMobileCanvas() {
    const canvas = this.$refs.mobileDrawingCanvas;
    if (canvas && this.drawing.mobileCtx) {
      this.drawing.mobileCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
  },

  clearDrawings() {
    const slideId = this.getCurrentSlideId();
    this.drawing.slideDrawings.set(slideId, []);

    if (this.isMobile) {
      this.clearMobileCanvas();
    } else {
      this.clearCanvas();
    }

    this.socket.emit('drawing-clear', { slideId });
  },

  getCurrentSlideId() {
    return `slide-${this.currentSlide}`;
  },

  generateStrokeId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  handleRemoteDrawingStart(data) {
    const stroke = {
      id: data.strokeId,
      slideId: data.slideId,
      points: [{ x: data.x, y: data.y }],
      color: data.color,
      width: data.width,
      tool: data.tool,
      timestamp: new Date().toISOString()
    };

    this.drawing.tempStrokes.set(data.strokeId, stroke);
  },

  handleRemoteDrawingMove(data) {
    const stroke = this.drawing.tempStrokes.get(data.strokeId);
    if (!stroke) return;

    const lastPoint = stroke.points[stroke.points.length - 1];
    const newPoint = { x: data.x, y: data.y };

    stroke.points.push(newPoint);
    if (this.isMobile) {
      this.drawMobileLine(lastPoint, newPoint, stroke.color, stroke.width, stroke.tool);
    } else {
      this.drawLine(lastPoint, newPoint, stroke.color, stroke.width, stroke.tool);
    }
  },

  handleRemoteDrawingEnd(data) {
    const stroke = this.drawing.tempStrokes.get(data.strokeId);
    if (!stroke) return;

    const slideId = stroke.slideId;
    if (!this.drawing.slideDrawings.has(slideId)) {
      this.drawing.slideDrawings.set(slideId, []);
    }
    this.drawing.slideDrawings.get(slideId).push(stroke);

    this.drawing.tempStrokes.delete(data.strokeId);
  },

  handleRemoteDrawingClear(data) {
    if (data.slideId === this.getCurrentSlideId()) {
      if (this.isMobile) {
        this.clearMobileCanvas();
      } else {
        this.clearCanvas();
      }
    }
    this.drawing.slideDrawings.set(data.slideId, []);
  },

  showDrawingToolbar() {
    this.drawing.toolbarVisible = true;
  },

  hideDrawingToolbar() {
    if (!this.drawing.isDrawingMode) {
      this.drawing.toolbarVisible = false;
    }
  }
};
