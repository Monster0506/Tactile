const fs = require('fs').promises;
const path = require('path');
const FileProcessor = require('../FileProcessor');

// Mock dependencies
jest.mock('pdf-poppler');
jest.mock('sharp');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn()
  }
}));

const mockPdf = require('pdf-poppler');
const mockSharp = require('sharp');

describe('FileProcessor', () => {
  let fileProcessor;
  
  beforeEach(() => {
    fileProcessor = new FileProcessor();
    jest.clearAllMocks();
    
    // Setup sharp mock chain
    const mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toFile: jest.fn().mockResolvedValue()
    };
    mockSharp.mockReturnValue(mockSharpInstance);
  });

  describe('detectFormat', () => {
    test('should detect PDF format', () => {
      expect(fileProcessor.detectFormat('presentation.pdf')).toBe('.pdf');
      expect(fileProcessor.detectFormat('PRESENTATION.PDF')).toBe('.pdf');
    });

    test('should detect PowerPoint formats', () => {
      expect(fileProcessor.detectFormat('presentation.ppt')).toBe('.ppt');
      expect(fileProcessor.detectFormat('presentation.pptx')).toBe('.pptx');
    });

    test('should detect Markdown format', () => {
      expect(fileProcessor.detectFormat('presentation.md')).toBe('.md');
    });

    test('should return null for unsupported formats', () => {
      expect(fileProcessor.detectFormat('document.docx')).toBeNull();
      expect(fileProcessor.detectFormat('image.jpg')).toBeNull();
      expect(fileProcessor.detectFormat('video.mp4')).toBeNull();
    });

    test('should handle files without extensions', () => {
      expect(fileProcessor.detectFormat('presentation')).toBeNull();
    });
  });

  describe('validateFile', () => {
    beforeEach(() => {
      fs.stat.mockResolvedValue({ size: 1024 * 1024 }); // 1MB file
    });

    test('should validate supported PDF file', async () => {
      const result = await fileProcessor.validateFile('/path/to/file.pdf', 'presentation.pdf');
      expect(result).toBe(true);
    });

    test('should reject unsupported file format', async () => {
      const result = await fileProcessor.validateFile('/path/to/file.docx', 'document.docx');
      expect(result).toBe(false);
    });

    test('should reject file that is too large', async () => {
      fs.stat.mockResolvedValue({ size: 100 * 1024 * 1024 }); // 100MB file
      
      const result = await fileProcessor.validateFile('/path/to/file.pdf', 'large.pdf');
      expect(result).toBe(false);
    });

    test('should handle file stat errors', async () => {
      fs.stat.mockRejectedValue(new Error('File not found'));
      
      const result = await fileProcessor.validateFile('/path/to/nonexistent.pdf', 'file.pdf');
      expect(result).toBe(false);
    });
  });

  describe('processFile', () => {
    beforeEach(() => {
      fs.stat.mockResolvedValue({ size: 1024 * 1024 }); // 1MB file
      fs.mkdir.mockResolvedValue();
      fs.unlink.mockResolvedValue();
    });

    test('should process PDF file successfully', async () => {
      mockPdf.convert.mockResolvedValue(['slide-1.png', 'slide-2.png']);
      
      const result = await fileProcessor.processFile('/temp/file.pdf', 'presentation.pdf');
      
      expect(result).toMatchObject({
        presentationId: expect.any(String),
        title: 'presentation',
        slides: expect.arrayContaining([
          expect.objectContaining({
            id: 'slide-1',
            imageUrl: expect.stringContaining('/slides/'),
            thumbnailUrl: expect.stringContaining('/slides/'),
            order: 1
          })
        ]),
        totalSlides: 2,
        createdAt: expect.any(String)
      });
      
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalledWith('/temp/file.pdf');
    });

    test('should reject unsupported file format', async () => {
      await expect(
        fileProcessor.processFile('/temp/file.docx', 'document.docx')
      ).rejects.toThrow('Unsupported file format');
    });

    test('should reject file that is too large', async () => {
      fs.stat.mockResolvedValue({ size: 100 * 1024 * 1024 }); // 100MB file
      
      await expect(
        fileProcessor.processFile('/temp/large.pdf', 'large.pdf')
      ).rejects.toThrow('File too large');
    });

    test('should clean up temporary file on error', async () => {
      mockPdf.convert.mockRejectedValue(new Error('PDF conversion failed'));
      
      await expect(
        fileProcessor.processFile('/temp/file.pdf', 'presentation.pdf')
      ).rejects.toThrow('PDF conversion failed');
      
      expect(fs.unlink).toHaveBeenCalledWith('/temp/file.pdf');
    });

    test('should handle PowerPoint files with appropriate error', async () => {
      await expect(
        fileProcessor.processFile('/temp/file.pptx', 'presentation.pptx')
      ).rejects.toThrow('PowerPoint conversion not yet implemented');
    });

    test('should handle Markdown files with appropriate error', async () => {
      await expect(
        fileProcessor.processFile('/temp/file.md', 'presentation.md')
      ).rejects.toThrow('Markdown conversion not yet implemented');
    });
  });

  describe('convertPDF', () => {
    beforeEach(() => {
      mockPdf.convert.mockResolvedValue(['slide-1.png', 'slide-2.png', 'slide-3.png']);
    });

    test('should convert PDF and generate thumbnails', async () => {
      const slides = await fileProcessor.convertPDF('/path/to/file.pdf', '/output/dir');
      
      expect(mockPdf.convert).toHaveBeenCalledWith('/path/to/file.pdf', {
        format: 'png',
        out_dir: '/output/dir',
        out_prefix: 'slide',
        page: null
      });
      
      expect(slides).toHaveLength(3);
      expect(slides[0]).toMatchObject({
        id: 'slide-1',
        imageUrl: expect.stringContaining('slide-1.png'),
        thumbnailUrl: expect.stringContaining('thumb-1.png'),
        order: 1
      });
      
      // Verify thumbnail generation
      expect(mockSharp).toHaveBeenCalledTimes(3);
    });

    test('should handle PDF conversion errors', async () => {
      mockPdf.convert.mockRejectedValue(new Error('Invalid PDF'));
      
      await expect(
        fileProcessor.convertPDF('/path/to/invalid.pdf', '/output/dir')
      ).rejects.toThrow('PDF conversion failed: Invalid PDF');
    });
  });

  describe('getSupportedFormats', () => {
    test('should return array of supported formats', () => {
      const formats = fileProcessor.getSupportedFormats();
      expect(formats).toEqual(['.pdf', '.ppt', '.pptx', '.md']);
    });

    test('should return a copy of the array', () => {
      const formats1 = fileProcessor.getSupportedFormats();
      const formats2 = fileProcessor.getSupportedFormats();
      expect(formats1).not.toBe(formats2);
    });
  });

  describe('getMaxFileSize', () => {
    test('should return maximum file size', () => {
      expect(fileProcessor.getMaxFileSize()).toBe(50 * 1024 * 1024);
    });
  });
});