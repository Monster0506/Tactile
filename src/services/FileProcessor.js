const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-poppler');
const sharp = require('sharp');
const mime = require('mime-types');

class FileProcessor {
  constructor() {
    this.supportedFormats = ['.pdf', '.ppt', '.pptx', '.md'];
    this.maxFileSize = 50 * 1024 * 1024;
    this.outputDir = 'uploads/slides';
    this.tempDir = 'uploads/temp';
  }

  /**
   * Process uploaded file and convert to slide images
   * @param {string} filePath - Path to uploaded file
   * @param {string} originalName - Original filename
   * @returns {Promise<Object>} Processing result with slide URLs
   */
  async processFile(filePath, originalName) {
    try {
      // Validate file format
      const fileExtension = this.detectFormat(originalName);
      if (!fileExtension) {
        throw new Error(`Unsupported file format. Supported formats: ${this.supportedFormats.join(', ')}`);
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large. Maximum size is ${this.maxFileSize / (1024 * 1024)}MB`);
      }

      // Generate unique presentation ID
      const presentationId = Date.now().toString();
      const slideDir = path.join(this.outputDir, presentationId);
      
      // Ensure output directory exists
      await fs.mkdir(slideDir, { recursive: true });

      let slides = [];

      // Process based on file type
      switch (fileExtension) {
        case '.pdf':
          slides = await this.convertPDF(filePath, slideDir);
          break;
        case '.ppt':
        case '.pptx':
          slides = await this.convertPowerPoint(filePath, slideDir);
          break;
        case '.md':
          slides = await this.convertMarkdown(filePath, slideDir);
          break;
        default:
          throw new Error(`Processing not implemented for ${fileExtension} files`);
      }

      // Clean up temporary file
      await fs.unlink(filePath);

      return {
        presentationId,
        title: path.basename(originalName, fileExtension),
        slides,
        totalSlides: slides.length,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      // Clean up on error
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * Detect file format from filename
   * @param {string} filename - Original filename
   * @returns {string|null} File extension or null if unsupported
   */
  detectFormat(filename) {
    const extension = path.extname(filename).toLowerCase();
    return this.supportedFormats.includes(extension) ? extension : null;
  }

  /**
   * Validate file format and size
   * @param {string} filePath - Path to file
   * @param {string} originalName - Original filename
   * @returns {Promise<boolean>} True if valid
   */
  async validateFile(filePath, originalName) {
    try {
      // Check format
      const format = this.detectFormat(originalName);
      if (!format) {
        return false;
      }

      // Check MIME type matches extension
      const mimeType = mime.lookup(originalName);
      const expectedMimes = {
        '.pdf': 'application/pdf',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.md': 'text/markdown'
      };

      if (mimeType && expectedMimes[format] && mimeType !== expectedMimes[format]) {
        return false;
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert PDF to slide images
   * @param {string} pdfPath - Path to PDF file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertPDF(pdfPath, outputDir) {
    try {
      const options = {
        format: 'png',
        out_dir: outputDir,
        out_prefix: 'slide',
        page: null // Convert all pages
      };

      // Convert PDF to images
      const convertedFiles = await pdf.convert(pdfPath, options);
      
      const slides = [];
      
      // Process each converted page
      for (let i = 0; i < convertedFiles.length; i++) {
        const slideNumber = i + 1;
        const slideFilename = `slide-${slideNumber}.png`;
        const slidePath = path.join(outputDir, slideFilename);
        const thumbnailFilename = `thumb-${slideNumber}.png`;
        const thumbnailPath = path.join(outputDir, thumbnailFilename);

        // Generate thumbnail
        await sharp(slidePath)
          .resize(200, 150, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toFile(thumbnailPath);

        slides.push({
          id: `slide-${slideNumber}`,
          imageUrl: `/slides/${path.basename(outputDir)}/${slideFilename}`,
          thumbnailUrl: `/slides/${path.basename(outputDir)}/${thumbnailFilename}`,
          order: slideNumber
        });
      }

      return slides;
    } catch (error) {
      throw new Error(`PDF conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert PowerPoint to slide images (placeholder implementation)
   * @param {string} pptPath - Path to PowerPoint file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertPowerPoint(pptPath, outputDir) {
    // This is a placeholder - actual implementation would require LibreOffice or similar
    throw new Error('PowerPoint conversion not yet implemented. Please use PDF format.');
  }

  /**
   * Convert Markdown to slide images (placeholder implementation)
   * @param {string} mdPath - Path to Markdown file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertMarkdown(mdPath, outputDir) {
    // This is a placeholder - actual implementation would require markdown parsing and HTML rendering
    throw new Error('Markdown conversion not yet implemented. Please use PDF format.');
  }

  /**
   * Get supported file formats
   * @returns {Array<string>} Array of supported extensions
   */
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  /**
   * Get maximum file size
   * @returns {number} Maximum file size in bytes
   */
  getMaxFileSize() {
    return this.maxFileSize;
  }
}

module.exports = FileProcessor;