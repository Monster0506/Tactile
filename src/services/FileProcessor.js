const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-poppler');
const sharp = require('sharp');
const mime = require('mime-types');
const MarkdownIt = require('markdown-it');

/** pdf-poppler: max width in px of the rasterized page (longer side scales to this) */
const PDF_RASTER_MAX_WIDTH_PX = 6144;

/** Logical 16:9 slide (CSS px) for markdown HTML + Puppeteer layout */
const SLIDE_VIEWPORT_WIDTH = 1920;
const SLIDE_VIEWPORT_HEIGHT = 1080;

/**
 * Puppeteer screenshots at this device scale → physical pixels = logical × factor
 * (e.g. 1920×1080 @4 = 7680×4320 PNG). Higher = sharper bitmap; does not change CSS font sizes.
 */
const SLIDE_SCREENSHOT_DEVICE_SCALE = 4;

/** Thumbnail target (16:9); rasterized at SLIDE_THUMB_DEVICE_SCALE for crisp UI */
const SLIDE_THUMB_WIDTH = 960;
const SLIDE_THUMB_HEIGHT = 540;
const SLIDE_THUMB_DEVICE_SCALE = 4;

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
        scale: PDF_RASTER_MAX_WIDTH_PX
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
          .resize(SLIDE_THUMB_WIDTH, SLIDE_THUMB_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png({ compressionLevel: 9 })
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
          width: SLIDE_VIEWPORT_WIDTH * SLIDE_SCREENSHOT_DEVICE_SCALE,
          height: SLIDE_VIEWPORT_HEIGHT * SLIDE_SCREENSHOT_DEVICE_SCALE,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
      
      // Save the placeholder slide
      await fs.writeFile(slidePath, placeholderBuffer);
      
      // Generate thumbnail
      await sharp(slidePath)
        .resize(SLIDE_THUMB_WIDTH, SLIDE_THUMB_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ compressionLevel: 9 })
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
   * Convert markdown file to slide images
   * @param {string} mdPath - Path to markdown file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertMarkdown(mdPath, outputDir) {
    const puppeteer = require('puppeteer');
    
    try {
      // Read markdown content
      const markdownContent = await fs.readFile(mdPath, 'utf8');
      
      // Parse and paginate markdown
      const pages = this.paginateMarkdown(markdownContent);
      
      const slides = [];
      const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: function (str, lang) {
          const hljs = require('highlight.js');
          if (lang && hljs.getLanguage(lang)) {
            try {
              return '<pre class="hljs"><code>' +
                     hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                     '</code></pre>';
            } catch (__) {}
          }
          return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
        }
      });
      
      // Launch browser for rendering
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      try {
        for (let i = 0; i < pages.length; i++) {
          const slideNumber = i + 1;
          const slideId = `slide-${slideNumber}`;
          const slideImagePath = path.join(outputDir, `${slideId}.png`);
          const thumbImagePath = path.join(outputDir, `thumb-${slideNumber}.png`);
          
          // Convert markdown to HTML
          const htmlContent = md.render(pages[i]);
          
          // Create full HTML page with styling
          const fullHtml = this.createSlideHtml(htmlContent, slideNumber);
          
          // Create new page for each slide
          const page = await browser.newPage();
          
          // Set viewport for slide dimensions (16:9 aspect ratio)
          await page.setViewport({
            width: SLIDE_VIEWPORT_WIDTH,
            height: SLIDE_VIEWPORT_HEIGHT,
            deviceScaleFactor: SLIDE_SCREENSHOT_DEVICE_SCALE
          });
          
          // Set content and wait for fonts/images to load
          await page.setContent(fullHtml, {
            waitUntil: ['networkidle0', 'domcontentloaded']
          });
          
          // Take screenshot for main slide
          await page.screenshot({
            path: slideImagePath,
            type: 'png',
            fullPage: false
          });

          await page.setViewport({
            width: SLIDE_THUMB_WIDTH,
            height: SLIDE_THUMB_HEIGHT,
            deviceScaleFactor: SLIDE_THUMB_DEVICE_SCALE
          });

          await page.screenshot({
            path: thumbImagePath,
            type: 'png',
            fullPage: false
          });
          
          await page.close();
          
          // Add slide to results
          slides.push({
            id: slideId,
            imageUrl: `/slides/${path.basename(outputDir)}/${slideId}.png`,
            thumbnailUrl: `/slides/${path.basename(outputDir)}/thumb-${slideNumber}.png`,
            order: slideNumber
          });
          
          console.log(`Generated slide ${slideNumber}/${pages.length}`);
        }
      } finally {
        await browser.close();
      }
      
      console.log(`Successfully converted ${pages.length} markdown slides`);
      return slides;
      
    } catch (error) {
      console.error('Error converting markdown:', error);
      throw new Error(`Failed to convert markdown: ${error.message}`);
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
   * Create styled HTML for a slide
   * @param {string} htmlContent - Rendered HTML from markdown
   * @param {number} slideNumber - Slide number
   * @returns {string} Complete HTML page
   */
  createSlideHtml(htmlContent, slideNumber) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Slide ${slideNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: white;
            color: #333;
            width: 1920px;
            height: 1080px;
            margin: 0;
            padding: 80px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            text-align: center;
            box-sizing: border-box;
        }
        
        .slide-container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            position: relative;
            text-align: center;
        }
        
        /* Heading scale: each level visually distinct (size, weight, color, ornament) */
        h1 {
            font-size: 144px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 auto 48px;
            line-height: 1.12;
            letter-spacing: -0.035em;
            text-align: center;
            max-width: 95%;
            padding-bottom: 28px;
            border-bottom: 12px solid #667eea;
        }
        
        h2 {
            font-size: 118px;
            font-weight: 700;
            color: #1e3a5f;
            margin-bottom: 36px;
            line-height: 1.18;
            letter-spacing: -0.025em;
            text-align: center;
        }
        
        h3 {
            font-size: 100px;
            font-weight: 700;
            color: #5b21b6;
            margin-bottom: 30px;
            line-height: 1.22;
            letter-spacing: -0.02em;
            text-align: center;
        }
        
        h4 {
            font-size: 84px;
            font-weight: 600;
            color: #1d4ed8;
            margin-bottom: 26px;
            line-height: 1.28;
            text-align: center;
            padding: 20px 36px;
            background: rgba(102, 126, 234, 0.14);
            border-radius: 16px;
            max-width: 92%;
            margin-left: auto;
            margin-right: auto;
        }
        
        h5 {
            font-size: 72px;
            font-weight: 600;
            color: #475569;
            margin-bottom: 22px;
            line-height: 1.32;
            font-style: italic;
            text-align: center;
        }
        
        h6 {
            font-size: 58px;
            font-weight: 700;
            color: #64748b;
            margin-bottom: 20px;
            line-height: 1.35;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 0.14em;
        }
        
        p {
            font-size: 64px;
            line-height: 1.6;
            margin-bottom: 25px;
            color: #4a5568;
            text-align: center;
        }
        
        ul, ol {
            font-size: 64px;
            line-height: 1.8;
            margin-bottom: 30px;
            padding-left: 50px;
            color: #4a5568;
            text-align: left;
            display: inline-block;
        }
        
        li {
            margin-bottom: 15px;
        }
        
        blockquote {
            border-left: 8px solid #667eea;
            background: #f7fafc;
            padding: 30px 40px;
            margin: 30px 0;
            font-style: italic;
            font-size: 72px;
            color: #2d3748;
            border-radius: 0 15px 15px 0;
        }
        
        code {
            background: #f1f5f9;
            padding: 4px 12px;
            border-radius: 6px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 56px;
            color: #e53e3e;
        }
        
        pre {
            background: #1a202c;
            color: #e2e8f0;
            padding: 40px;
            border-radius: 15px;
            margin: 30px auto;
            overflow-x: auto;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 48px;
            line-height: 1.5;
            text-align: left;
            width: max-content;
            max-width: 100%;
            box-sizing: border-box;
            align-self: center;
            white-space: pre;
        }
        
        pre code {
            background: none;
            padding: 0;
            color: inherit;
            font-size: inherit;
            text-align: left;
            display: block;
        }
        
        /* Syntax highlighting for code blocks */
        .hljs-keyword { color: #c792ea; }
        .hljs-string { color: #c3e88d; }
        .hljs-number { color: #f78c6c; }
        .hljs-comment { color: #546e7a; font-style: italic; }
        .hljs-function { color: #82aaff; }
        .hljs-variable { color: #eeffff; }
        .hljs-built_in { color: #ffcb6b; }
        .hljs-title { color: #82aaff; }
        .hljs-params { color: #f07178; }
        .hljs-attr { color: #ffcb6b; }
        .hljs-tag { color: #f07178; }
        .hljs-name { color: #f07178; }
        .hljs-selector-tag { color: #f07178; }
        .hljs-selector-class { color: #ffcb6b; }
        .hljs-selector-id { color: #82aaff; }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
            font-size: 56px;
        }
        
        th, td {
            border: 2px solid #e2e8f0;
            padding: 20px;
            text-align: left;
        }
        
        th {
            background: #667eea;
            color: white;
            font-weight: 600;
        }
        
        tr:nth-child(even) {
            background: #f7fafc;
        }
        
        a {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        img {
            max-width: 100%;
            height: auto;
            border-radius: 15px;
            margin: 30px 0;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        
        hr {
            border: none;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2);
            margin: 50px 0;
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <div class="slide-container">
        ${htmlContent}
    </div>
</body>
</html>`;
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