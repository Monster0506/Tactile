const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-poppler');
const sharp = require('sharp');
const mime = require('mime-types');
const MarkdownIt = require('markdown-it');

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
   * Convert PDF to slide images with proper resolution
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
        page: null, // Convert all pages
        scale: 2048 // High resolution for better quality
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

        // Generate high-quality thumbnail with proper aspect ratio
        await sharp(slidePath)
          .resize(300, 225, { 
            fit: 'inside', 
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png({ quality: 90 })
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
   * Convert PowerPoint to slide images
   * @param {string} pptPath - Path to PowerPoint file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertPowerPoint(pptPath, outputDir) {
    try {
      // For now, we'll create a basic implementation that generates placeholder slides
      // In a production environment, this would use LibreOffice headless mode or similar
      const slides = [];
      
      // Create a single placeholder slide for PowerPoint files
      const slideNumber = 1;
      const slideFilename = `slide-${slideNumber}.png`;
      const slidePath = path.join(outputDir, slideFilename);
      const thumbnailFilename = `thumb-${slideNumber}.png`;
      const thumbnailPath = path.join(outputDir, thumbnailFilename);
      
      // Create a placeholder image using Sharp
      const placeholderBuffer = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .png()
      .toBuffer();
      
      // Save the placeholder slide
      await fs.writeFile(slidePath, placeholderBuffer);
      
      // Generate thumbnail
      await sharp(slidePath)
        .resize(300, 225, { 
          fit: 'inside', 
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ quality: 90 })
        .toFile(thumbnailPath);
      
      slides.push({
        id: `slide-${slideNumber}`,
        imageUrl: `/slides/${path.basename(outputDir)}/${slideFilename}`,
        thumbnailUrl: `/slides/${path.basename(outputDir)}/${thumbnailFilename}`,
        order: slideNumber
      });

      return slides;
    } catch (error) {
      throw new Error(`PowerPoint conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert Markdown to slide images with pagination
   * @param {string} mdPath - Path to Markdown file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertMarkdown(mdPath, outputDir) {
    try {
      // Read markdown content
      const markdownContent = await fs.readFile(mdPath, 'utf-8');
      
      // Parse and paginate markdown
      const pages = this.paginateMarkdown(markdownContent);
      
      const slides = [];
      
      // Convert each page to a placeholder image
      for (let i = 0; i < pages.length; i++) {
        const slideNumber = i + 1;
        const slideFilename = `slide-${slideNumber}.png`;
        const slidePath = path.join(outputDir, slideFilename);
        const thumbnailFilename = `thumb-${slideNumber}.png`;
        const thumbnailPath = path.join(outputDir, thumbnailFilename);
        
        // Create a placeholder image with slide number for now
        // In production, this would render the HTML to an image
        const placeholderBuffer = await sharp({
          create: {
            width: 1920,
            height: 1080,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          }
        })
        .composite([{
          input: Buffer.from(`<svg width="1920" height="1080">
            <rect width="1920" height="1080" fill="white"/>
            <text x="960" y="540" font-family="Arial" font-size="48" text-anchor="middle" fill="black">
              Markdown Slide ${slideNumber}
            </text>
          </svg>`),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();
        
        // Save the placeholder slide
        await fs.writeFile(slidePath, placeholderBuffer);
        
        // Generate thumbnail
        await sharp(slidePath)
          .resize(300, 225, { 
            fit: 'inside', 
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png({ quality: 90 })
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
      throw new Error(`Markdown conversion failed: ${error.message}`);
    }
  }

  /**
   * Paginate markdown content into slides
   * @param {string} content - Markdown content
   * @returns {Array<string>} Array of markdown pages
   */
  paginateMarkdown(content) {
    // Split by horizontal rules (---) or by headers
    let pages = [];
    
    // First try splitting by horizontal rules
    const hrSplit = content.split(/^---+$/m);
    
    if (hrSplit.length > 1) {
      // Use horizontal rule pagination
      pages = hrSplit.filter(page => page.trim().length > 0);
    } else {
      // Split by top-level headers (# Header)
      const headerSplit = content.split(/^# /m);
      
      if (headerSplit.length > 1) {
        // First element might be empty or content before first header
        const firstPage = headerSplit[0].trim();
        if (firstPage) {
          pages.push(firstPage);
        }
        
        // Add remaining pages with headers restored
        for (let i = 1; i < headerSplit.length; i++) {
          pages.push('# ' + headerSplit[i]);
        }
      } else {
        // No clear pagination, treat as single slide
        pages = [content];
      }
    }
    
    return pages.map(page => page.trim()).filter(page => page.length > 0);
  }

  /**
   * Create HTML template for markdown slide
   * @param {string} markdownContent - Markdown content for the slide
   * @returns {string} HTML content
   */
  createSlideHTML(markdownContent) {
    const md = new MarkdownIt();
    const htmlContent = md.render(markdownContent);
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Slide</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 60px;
            background: white;
            color: #333;
            line-height: 1.6;
            width: 1920px;
            height: 1080px;
            box-sizing: border-box;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          
          h1 {
            font-size: 3.5em;
            margin-bottom: 0.5em;
            color: #2c3e50;
            text-align: center;
          }
          
          h2 {
            font-size: 2.5em;
            margin-bottom: 0.5em;
            color: #34495e;
            border-bottom: 3px solid #3498db;
            padding-bottom: 0.2em;
          }
          
          h3 {
            font-size: 2em;
            margin-bottom: 0.5em;
            color: #34495e;
          }
          
          p {
            font-size: 1.5em;
            margin-bottom: 1em;
          }
          
          ul, ol {
            font-size: 1.4em;
            margin-left: 2em;
          }
          
          li {
            margin-bottom: 0.5em;
          }
          
          code {
            background: #f8f9fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
          }
          
          pre {
            background: #f8f9fa;
            padding: 1.5em;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 1.2em;
            border-left: 4px solid #3498db;
          }
          
          blockquote {
            border-left: 4px solid #3498db;
            padding-left: 1.5em;
            margin: 1.5em 0;
            font-style: italic;
            color: #555;
          }
          
          img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1em auto;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 1em 0;
            font-size: 1.3em;
          }
          
          th, td {
            border: 1px solid #ddd;
            padding: 0.8em;
            text-align: left;
          }
          
          th {
            background: #f8f9fa;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
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