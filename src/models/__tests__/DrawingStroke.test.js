const DrawingStroke = require('../DrawingStroke');

describe('DrawingStroke Model', () => {
  let stroke;

  beforeEach(() => {
    stroke = new DrawingStroke({ slideId: 'slide-123' });
  });

  describe('constructor', () => {
    it('should create stroke with default values', () => {
      expect(stroke.id).toBeDefined();
      expect(stroke.slideId).toBe('slide-123');
      expect(stroke.points).toEqual([]);
      expect(stroke.color).toBe('#000000');
      expect(stroke.width).toBe(2);
      expect(stroke.timestamp).toBeInstanceOf(Date);
    });

    it('should create stroke with provided data', () => {
      const data = {
        id: 'custom-id',
        slideId: 'slide-456',
        points: [{ x: 10, y: 20 }],
        color: '#FF0000',
        width: 5,
        timestamp: new Date('2023-01-01')
      };

      const customStroke = new DrawingStroke(data);
      expect(customStroke.id).toBe('custom-id');
      expect(customStroke.slideId).toBe('slide-456');
      expect(customStroke.points).toEqual([{ x: 10, y: 20 }]);
      expect(customStroke.color).toBe('#FF0000');
      expect(customStroke.width).toBe(5);
      expect(customStroke.timestamp).toEqual(new Date('2023-01-01'));
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = stroke.generateId();
      const id2 = stroke.generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBe(16); // 8 bytes * 2 hex chars
    });
  });

  describe('point management', () => {
    describe('addPoint', () => {
      it('should add point to stroke', () => {
        stroke.addPoint(100, 200);
        
        expect(stroke.points).toHaveLength(1);
        expect(stroke.points[0]).toEqual({ x: 100, y: 200 });
      });

      it('should add multiple points', () => {
        stroke.addPoint(10, 20);
        stroke.addPoint(30, 40);
        stroke.addPoint(50, 60);
        
        expect(stroke.points).toHaveLength(3);
        expect(stroke.points[0]).toEqual({ x: 10, y: 20 });
        expect(stroke.points[1]).toEqual({ x: 30, y: 40 });
        expect(stroke.points[2]).toEqual({ x: 50, y: 60 });
      });

      it('should convert coordinates to numbers', () => {
        stroke.addPoint('100', '200');
        
        expect(stroke.points[0]).toEqual({ x: 100, y: 200 });
      });
    });

    describe('getPoints', () => {
      it('should return copy of points array', () => {
        stroke.addPoint(10, 20);
        stroke.addPoint(30, 40);
        
        const points = stroke.getPoints();
        expect(points).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
        
        // Modifying returned array should not affect original
        points.push({ x: 999, y: 999 });
        expect(stroke.points).toHaveLength(2);
      });
    });

    describe('getLength', () => {
      it('should return number of points', () => {
        expect(stroke.getLength()).toBe(0);
        
        stroke.addPoint(10, 20);
        expect(stroke.getLength()).toBe(1);
        
        stroke.addPoint(30, 40);
        expect(stroke.getLength()).toBe(2);
      });
    });

    describe('isEmpty', () => {
      it('should return true for empty stroke', () => {
        expect(stroke.isEmpty()).toBe(true);
      });

      it('should return false for stroke with points', () => {
        stroke.addPoint(10, 20);
        expect(stroke.isEmpty()).toBe(false);
      });
    });
  });

  describe('getBoundingBox', () => {
    it('should return null for empty stroke', () => {
      const bbox = stroke.getBoundingBox();
      expect(bbox).toBeNull();
    });

    it('should return correct bounding box for single point', () => {
      stroke.addPoint(100, 200);
      
      const bbox = stroke.getBoundingBox();
      expect(bbox).toEqual({
        minX: 100,
        maxX: 100,
        minY: 200,
        maxY: 200
      });
    });

    it('should return correct bounding box for multiple points', () => {
      stroke.addPoint(50, 100);
      stroke.addPoint(200, 50);
      stroke.addPoint(25, 300);
      stroke.addPoint(150, 75);
      
      const bbox = stroke.getBoundingBox();
      expect(bbox).toEqual({
        minX: 25,
        maxX: 200,
        minY: 50,
        maxY: 300
      });
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize and deserialize correctly', () => {
      stroke.addPoint(10, 20);
      stroke.addPoint(30, 40);
      stroke.color = '#FF0000';
      stroke.width = 5;

      const json = stroke.toJSON();
      const restored = DrawingStroke.fromJSON(json);

      expect(restored.id).toBe(stroke.id);
      expect(restored.slideId).toBe(stroke.slideId);
      expect(restored.points).toEqual(stroke.points);
      expect(restored.color).toBe(stroke.color);
      expect(restored.width).toBe(stroke.width);
      expect(restored.timestamp).toEqual(stroke.timestamp);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      stroke.addPoint(10, 20);
    });

    it('should validate correct stroke', () => {
      const result = stroke.validate();
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required fields', () => {
      stroke.id = null;
      stroke.slideId = null;

      const result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Stroke ID is required and must be a string');
      expect(result.errors).toContain('Slide ID is required and must be a string');
    });

    it('should validate points array', () => {
      stroke.points = 'not an array';

      const result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Points must be an array');
    });

    it('should validate individual points', () => {
      stroke.points = [
        { x: 10, y: 20 },
        { x: 'invalid', y: 30 },
        { x: 40, y: null }
      ];

      const result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Point 1: x and y coordinates must be numbers');
      expect(result.errors).toContain('Point 2: x and y coordinates must be numbers');
    });

    it('should validate color format', () => {
      stroke.color = 'invalid-color';

      const result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Color must be a valid hex color (e.g., #FF0000)');
    });

    it('should accept valid hex colors', () => {
      const validColors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#123ABC'];
      
      for (const color of validColors) {
        stroke.color = color;
        const result = stroke.validate();
        expect(result.isValid).toBe(true);
      }
    });

    it('should validate width', () => {
      stroke.width = 0;
      let result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Width must be a positive number');

      stroke.width = -5;
      result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Width must be a positive number');

      stroke.width = 'invalid';
      result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Width must be a positive number');
    });

    it('should detect missing color and width', () => {
      stroke.color = null;
      stroke.width = null;

      const result = stroke.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Color is required and must be a string');
      expect(result.errors).toContain('Width must be a positive number');
    });
  });
});