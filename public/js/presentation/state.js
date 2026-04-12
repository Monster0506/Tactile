export function createDrawingState() {
  return {
    isDrawingMode: false,
    toolbarVisible: false,
    mobileControlsVisible: false,
    currentTool: 'pen',
    currentColor: '#ff0000',
    currentWidth: 3,
    colorPresets: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'],
    isDrawing: false,
    currentStroke: null,
    slideDrawings: new Map(),
    tempStrokes: new Map(),
    lastPoint: null
  };
}
