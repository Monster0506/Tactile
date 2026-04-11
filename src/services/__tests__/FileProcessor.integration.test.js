const fs = require('fs').promises;
const path = require('path');
const FileProcessor = require('../FileProcessor');

describe('FileProcessor Integration Tests', () => {
  let fileProcessor;
  const testDir = path.join(__dirname, 'test-files');
  const outputDir = path.join(__dirname, 'test-output');

  beforeAll(async () => {
    fileProcessor = new FileProcessor();
    
    // Create test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir('uploads/temp', { recursive: true });
    await fs.mkdir('uploads/slides', { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directories
    try {
      await fs.rmdir(testDir, { recursive: true });
      await fs.rmdir(outputDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File Format Detection', () => {
    test('should correctly identify supported formats', () => {
      const testCases = [
        { filename: 'presentation.pdf', expected: '.pdf' },
        { filename: 'slides.ppt', expected: '.ppt' },
        { filename: 'deck.pptx', expected: '.pptx' },
        { filename: 'notes.md', expected: '.md' },
        { filename: 'document.docx', expected: null },
        { filename: 'image.png', expected: null },
        { filename: 'noextension', expected: null }
      ];

      testCases.forEach(({ filename, expected }) => {
        expect(fileProcessor.detectFormat(filename)).toBe(expected);
      });
    });

    test('should be case insensitive', () => {
      expect(fileProcessor.detectFormat('PRESENTATION.PDF')).toBe('.pdf');
      expect(fileProcessor.detectFormat('Slides.PPT')).toBe('.ppt');
      expect(fileProcessor.detectFormat('Deck.PPTX')).toBe('.pptx');
      expect(fileProcessor.detectFormat('Notes.MD')).toBe('.md');
    });
  });

  describe('File Size Validation', () => {
    test('should accept files within size limit', async () => {
      // Create a small test file
      const testFile = path.join(testDir, 'small.pdf');
      await fs.writeFile(testFile, 'small file content');

      const isValid = await fileProcessor.validateFile(testFile, 'small.pdf');
      expect(isValid).toBe(true);
    });

    test('should reject files exceeding size limit', async () => {
      // Create a FileProcessor with smaller size limit for testing
      const testProcessor = new FileProcessor();
      testProcessor.maxFileSize = 10; // 10 bytes

      const testFile = path.join(testDir, 'large.pdf');
      await fs.writeFile(testFile, 'this content is longer than 10 bytes');

      const isValid = await testProcessor.validateFile(testFile, 'large.pdf');
      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent files gracefully', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.pdf');
      const isValid = await fileProcessor.validateFile(nonExistentFile, 'nonexistent.pdf');
      expect(isValid).toBe(false);
    });

    test('should throw appropriate error for unsupported formats', async () => {
      const testFile = path.join(testDir, 'document.docx');
      await fs.writeFile(testFile, 'test content');

      await expect(
        fileProcessor.processFile(testFile, 'document.docx')
      ).rejects.toThrow('Unsupported file format');
    });

    test('should throw appropriate error for PowerPoint files', async () => {
      const testFile = path.join(testDir, 'presentation.pptx');
      await fs.writeFile(testFile, 'test content');

      await expect(
        fileProcessor.processFile(testFile, 'presentation.pptx')
      ).rejects.toThrow('PowerPoint conversion not yet implemented');
    });

    test('should throw appropriate error for Markdown files', async () => {
      const testFile = path.join(testDir, 'presentation.md');
      await fs.writeFile(testFile, 'test content');

      await expect(
        fileProcessor.processFile(testFile, 'presentation.md')
      ).rejects.toThrow('Markdown conversion not yet implemented');
    });
  });

  describe('Configuration', () => {
    test('should return correct supported formats', () => {
      const formats = fileProcessor.getSupportedFormats();
      expect(formats).toEqual(['.pdf', '.ppt', '.pptx', '.md']);
      expect(Array.isArray(formats)).toBe(true);
    });

    test('should return correct maximum file size', () => {
      const maxSize = fileProcessor.getMaxFileSize();
      expect(maxSize).toBe(50 * 1024 * 1024); // 50MB
      expect(typeof maxSize).toBe('number');
    });

    test('should return a copy of supported formats array', () => {
      const formats1 = fileProcessor.getSupportedFormats();
      const formats2 = fileProcessor.getSupportedFormats();
      
      expect(formats1).toEqual(formats2);
      expect(formats1).not.toBe(formats2); // Different array instances
    });
  });
});