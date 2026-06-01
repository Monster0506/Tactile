const fs = require('fs').promises;
const path = require('path');
const Presentation = require('../Presentation');

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    rm: jest.fn()
  }
}));

describe('Presentation Model', () => {
  let presentation;

  beforeEach(() => {
    presentation = new Presentation();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create presentation with default values', () => {
      expect(presentation.id).toBeDefined();
      expect(presentation.title).toBe('Untitled Presentation');
      expect(presentation.slides).toEqual([]);
      expect(presentation.createdAt).toBeInstanceOf(Date);
      expect(presentation.sessionId).toBeNull();
    });

    it('should create presentation with provided data', () => {
      const data = {
        id: 'test-id',
        title: 'Test Presentation',
        slides: [{ id: 'slide1' }],
        sessionId: 'session-123'
      };

      const customPresentation = new Presentation(data);
      expect(customPresentation.id).toBe('test-id');
      expect(customPresentation.title).toBe('Test Presentation');
      expect(customPresentation.slides).toEqual([{ id: 'slide1' }]);
      expect(customPresentation.sessionId).toBe('session-123');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = presentation.generateId();
      const id2 = presentation.generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBe(32); // 16 bytes * 2 hex chars
    });
  });

  describe('generateUrl', () => {
    it('should generate correct URL path', () => {
      presentation.id = 'test-presentation-id';
      const url = presentation.generateUrl();
      expect(url).toBe('/presentation/test-presentation-id');
    });
  });

  describe('addSlide', () => {
    it('should add slide with generated ID and order', () => {
      const slideData = {
        imageUrl: '/images/slide1.png'
      };

      const slide = presentation.addSlide(slideData);

      expect(slide.id).toBeDefined();
      expect(slide.imageUrl).toBe('/images/slide1.png');
      expect(slide.drawings).toEqual([]);
      expect(slide.order).toBe(0);
      expect(presentation.slides).toHaveLength(1);
    });

    it('should maintain correct order for multiple slides', () => {
      presentation.addSlide({ imageUrl: '/slide1.png' });
      presentation.addSlide({ imageUrl: '/slide2.png' });
      presentation.addSlide({ imageUrl: '/slide3.png' });

      expect(presentation.slides[0].order).toBe(0);
      expect(presentation.slides[1].order).toBe(1);
      expect(presentation.slides[2].order).toBe(2);
    });
  });

  describe('getSlide', () => {
    beforeEach(() => {
      presentation.addSlide({ imageUrl: '/slide1.png' });
      presentation.addSlide({ imageUrl: '/slide2.png' });
    });

    it('should return slide by ID', () => {
      const slideId = presentation.slides[0].id;
      const slide = presentation.getSlide(slideId);
      
      expect(slide).toBeDefined();
      expect(slide.id).toBe(slideId);
      expect(slide.imageUrl).toBe('/slide1.png');
    });

    it('should return null for non-existent slide', () => {
      const slide = presentation.getSlide('non-existent-id');
      expect(slide).toBeNull();
    });
  });

  describe('getSlideByIndex', () => {
    beforeEach(() => {
      presentation.addSlide({ imageUrl: '/slide1.png' });
      presentation.addSlide({ imageUrl: '/slide2.png' });
    });

    it('should return slide by index', () => {
      const slide = presentation.getSlideByIndex(1);
      
      expect(slide).toBeDefined();
      expect(slide.imageUrl).toBe('/slide2.png');
      expect(slide.order).toBe(1);
    });

    it('should return null for invalid index', () => {
      expect(presentation.getSlideByIndex(5)).toBeNull();
      expect(presentation.getSlideByIndex(-1)).toBeNull();
    });
  });

  describe('getTotalSlides', () => {
    it('should return correct slide count', () => {
      expect(presentation.getTotalSlides()).toBe(0);
      
      presentation.addSlide({ imageUrl: '/slide1.png' });
      expect(presentation.getTotalSlides()).toBe(1);
      
      presentation.addSlide({ imageUrl: '/slide2.png' });
      expect(presentation.getTotalSlides()).toBe(2);
    });
  });

  describe('updateSlideDrawings', () => {
    let slideId;

    beforeEach(() => {
      const slide = presentation.addSlide({ imageUrl: '/slide1.png' });
      slideId = slide.id;
    });

    it('should update slide drawings', () => {
      const drawings = [{ id: 'stroke1', points: [{ x: 10, y: 20 }] }];
      
      presentation.updateSlideDrawings(slideId, drawings);
      
      const slide = presentation.getSlide(slideId);
      expect(slide.drawings).toEqual(drawings);
    });

    it('should not update drawings for non-existent slide', () => {
      const drawings = [{ id: 'stroke1' }];
      
      // Should not throw error
      presentation.updateSlideDrawings('non-existent-id', drawings);
      
      const slide = presentation.getSlide(slideId);
      expect(slide.drawings).toEqual([]);
    });
  });

  describe('createSlidesDirectory', () => {
    it('should create slides directory', async () => {
      await presentation.createSlidesDirectory();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        presentation.slidesDirectory,
        { recursive: true }
      );
    });

    it('should handle existing directory', async () => {
      const error = new Error('Directory exists');
      error.code = 'EEXIST';
      fs.mkdir.mockRejectedValueOnce(error);

      await expect(presentation.createSlidesDirectory()).resolves.not.toThrow();
    });

    it('should throw error for other mkdir failures', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fs.mkdir.mockRejectedValueOnce(error);

      await expect(presentation.createSlidesDirectory()).rejects.toThrow(
        'Failed to create slides directory: Permission denied'
      );
    });
  });

  describe('saveSlideImage', () => {
    it('should save image and return relative path', async () => {
      const imageBuffer = Buffer.from('fake image data');
      const filename = 'slide1.png';

      const imagePath = await presentation.saveSlideImage(imageBuffer, filename);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(presentation.slidesDirectory, filename),
        imageBuffer
      );
      expect(imagePath).toBe(`slides/${presentation.id}/slide1.png`);
    });
  });

  describe('delete', () => {
    it('should delete presentation directory', async () => {
      await presentation.delete();
      
      expect(fs.rm).toHaveBeenCalledWith(
        presentation.slidesDirectory,
        { recursive: true, force: true }
      );
    });

    it('should handle non-existent directory', async () => {
      const error = new Error('Directory not found');
      error.code = 'ENOENT';
      fs.rm.mockRejectedValueOnce(error);

      await expect(presentation.delete()).resolves.not.toThrow();
    });

    it('should throw error for other rm failures', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fs.rm.mockRejectedValueOnce(error);

      await expect(presentation.delete()).rejects.toThrow(
        'Failed to delete presentation files: Permission denied'
      );
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize and deserialize correctly', () => {
      presentation.title = 'Test Presentation';
      presentation.addSlide({ imageUrl: '/slide1.png' });
      presentation.sessionId = 'session-123';

      const json = presentation.toJSON();
      const restored = Presentation.fromJSON(json);

      expect(restored.id).toBe(presentation.id);
      expect(restored.title).toBe(presentation.title);
      expect(restored.slides).toEqual(presentation.slides);
      expect(restored.sessionId).toBe(presentation.sessionId);
      expect(restored.createdAt).toEqual(presentation.createdAt);
    });
  });

  describe('validate', () => {
    it('should validate correct presentation', () => {
      presentation.addSlide({
        imageUrl: '/slide1.png'
      });

      const result = presentation.validate();
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required fields', () => {
      presentation.id = null;
      presentation.title = null;

      const result = presentation.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Presentation ID is required and must be a string');
      expect(result.errors).toContain('Presentation title is required and must be a string');
    });

    it('should validate slide data', () => {
      presentation.slides = [
        { id: null, imageUrl: '/slide1.png', order: 0 },
        { id: 'slide2', imageUrl: null, order: 'invalid' }
      ];

      const result = presentation.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Slide 0: ID is required and must be a string');
      expect(result.errors).toContain('Slide 1: imageUrl is required and must be a string');
      expect(result.errors).toContain('Slide 1: order must be a number');
    });

    it('should detect invalid slides array', () => {
      presentation.slides = 'not an array';

      const result = presentation.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Slides must be an array');
    });
  });
});