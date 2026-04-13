const fs = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');
const os = require('os');
const sharp = require('sharp');
const mime = require('mime-types');
const MarkdownIt = require('markdown-it');
const {
  extractZipToDirectory,
  buildSlideHtmlDocumentsFromExtractedRoot,
  buildSlideHtmlDocumentsFromHacksuDeck
} = require('./htmlZipSlides');
const { resolveHacksuLayout } = require('./hacksuDeckCapture');

/** Scale factor passed to PDF.js viewport — higher = sharper, larger images */
const PDF_RASTER_SCALE = 3;

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
    this.supportedFormats = ['.pdf', '.zip', '.md'];
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
        case '.zip':
          slides = await this.convertHtmlZipPresentation(filePath, slideDir);
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
        '.zip': 'application/zip',
        '.md': 'text/markdown'
      };

      const looseMimes = new Set([
        'application/octet-stream',
        'binary/octet-stream',
        'application/x-msdownload'
      ]);
      const zipMimes = new Set(['application/zip', 'application/x-zip-compressed']);
      const mimeOk =
        !mimeType ||
        !expectedMimes[format] ||
        mimeType === expectedMimes[format] ||
        looseMimes.has(mimeType) ||
        (format === '.zip' && zipMimes.has(mimeType));
      if (!mimeOk) {
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
   * Convert PDF to slide images using PDF.js (pure JS) + Puppeteer (bundled Chromium).
   * No system binaries required — fully cross-platform.
   * @param {string} pdfPath - Path to PDF file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertPDF(pdfPath, outputDir) {
    const puppeteer = require('puppeteer');
    const fssync = require('fs');

    const pdfJsDir = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build');
    const pdfMjsUrl = pathToFileURL(path.join(pdfJsDir, 'pdf.mjs')).href;
    const pdfWorkerUrl = pathToFileURL(path.join(pdfJsDir, 'pdf.worker.mjs')).href;
    const pdfFileUrl = pathToFileURL(path.resolve(pdfPath)).href;

    // Temp HTML file that loads PDF.js as an ES module and exposes renderPage()
    const tmpHtml = path.join(os.tmpdir(), `tactile-pdf-${Date.now()}.html`);
    fssync.writeFileSync(tmpHtml, `<!DOCTYPE html>
<html><body style="margin:0;background:white">
<canvas id="c"></canvas>
<script type="module">
  import * as pdfjsLib from '${pdfMjsUrl}';
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${pdfWorkerUrl}';
  const pdfDoc = await pdfjsLib.getDocument('${pdfFileUrl}').promise;
  window.totalPages = pdfDoc.numPages;
  window.renderPage = async (pageNum, scale) => {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.getElementById('c');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { width: viewport.width, height: viewport.height };
  };
  window.pdfReady = true;
</script>
</body></html>`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });

    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(tmpHtml).href);
      await page.waitForFunction(() => window.pdfReady === true, { timeout: 30000 });

      const numPages = await page.evaluate(() => window.totalPages);
      const slides = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const slideId = `slide-${pageNum}`;
        const slideImagePath = path.join(outputDir, `${slideId}.png`);
        const thumbImagePath = path.join(outputDir, `thumb-${pageNum}.png`);

        const { width, height } = await page.evaluate(
          (n, scale) => window.renderPage(n, scale),
          pageNum, PDF_RASTER_SCALE
        );
        await page.setViewport({ width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 1 });
        const canvasEl = await page.$('#c');
        await canvasEl.screenshot({ path: slideImagePath, type: 'png' });

        await sharp(slideImagePath)
          .resize(SLIDE_THUMB_WIDTH, SLIDE_THUMB_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png({ compressionLevel: 9 })
          .toFile(thumbImagePath);

        slides.push({
          id: slideId,
          imageUrl: `/slides/${path.basename(outputDir)}/${slideId}.png`,
          thumbnailUrl: `/slides/${path.basename(outputDir)}/thumb-${pageNum}.png`,
          order: pageNum
        });

        console.log(`Rendered PDF page ${pageNum}/${numPages}`);
      }

      await page.close();
      return slides;
    } catch (error) {
      throw new Error(`PDF conversion failed: ${error.message}`);
    } finally {
      await browser.close();
      fssync.unlinkSync(tmpHtml);
    }
  }

  /**
   * Rasterize full HTML documents to slide + thumbnail PNGs (markdown + HacKSU presentation zips).
   * @param {string[]} fullHtmlDocuments - One complete HTML document per slide
   * @param {string} outputDir
   * @returns {Promise<Array<{ id: string, imageUrl: string, thumbnailUrl: string, order: number }>>}
   */
  async renderHtmlPagesToSlides(fullHtmlDocuments, outputDir) {
    const puppeteer = require('puppeteer');
    const slides = [];
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      for (let i = 0; i < fullHtmlDocuments.length; i++) {
        const slideNumber = i + 1;
        const slideId = `slide-${slideNumber}`;
        const slideImagePath = path.join(outputDir, `${slideId}.png`);
        const thumbImagePath = path.join(outputDir, `thumb-${slideNumber}.png`);

        const page = await browser.newPage();

        await page.setViewport({
          width: SLIDE_VIEWPORT_WIDTH,
          height: SLIDE_VIEWPORT_HEIGHT,
          deviceScaleFactor: SLIDE_SCREENSHOT_DEVICE_SCALE
        });

        await page.setContent(fullHtmlDocuments[i], {
          waitUntil: 'domcontentloaded'
        });

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

        slides.push({
          id: slideId,
          imageUrl: `/slides/${path.basename(outputDir)}/${slideId}.png`,
          thumbnailUrl: `/slides/${path.basename(outputDir)}/thumb-${slideNumber}.png`,
          order: slideNumber
        });

        console.log(`Generated slide ${slideNumber}/${fullHtmlDocuments.length}`);
      }
    } finally {
      await browser.close();
    }

    return slides;
  }

  /**
   * HacKSU presentation format (.zip): Jinja deck (presentation/app.py + templates/ + examples/) rendered
   * with Nunjucks, or plain HTML with &lt;div class="slide"&gt;…&lt;/div&gt;. CSS is inlined; assets use &lt;base href&gt; during capture.
   * @param {string} zipPath
   * @param {string} outputDir
   * @returns {Promise<Array>}
   */
  async convertHtmlZipPresentation(zipPath, outputDir) {
    const extractDir = path.join(outputDir, '_htmlsrc');
    await fs.mkdir(extractDir, { recursive: true });

    try {
      const buf = await fs.readFile(zipPath);
      await extractZipToDirectory(buf, extractDir);

      const hacksuLayout = await resolveHacksuLayout(extractDir);
      if (hacksuLayout) {
        const documents = await buildSlideHtmlDocumentsFromHacksuDeck(
          extractDir,
          hacksuLayout.presentationDir
        );
        const slides = await this.renderHtmlPagesToSlides(documents, outputDir);
        console.log(`Successfully converted ${slides.length} HacKSU slides (Jinja templates)`);
        return slides;
      }

      const documents = await buildSlideHtmlDocumentsFromExtractedRoot(extractDir);
      const slides = await this.renderHtmlPagesToSlides(documents, outputDir);
      console.log(`Successfully converted ${slides.length} HacKSU slides (static HTML)`);
      return slides;
    } catch (error) {
      throw new Error(`HacKSU slides conversion failed: ${error.message}`);
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Convert markdown file to slide images
   * @param {string} mdPath - Path to markdown file
   * @param {string} outputDir - Output directory for slides
   * @returns {Promise<Array>} Array of slide objects
   */
  async convertMarkdown(mdPath, outputDir) {
    try {
      const markdownContent = await fs.readFile(mdPath, 'utf8');
      const pages = this.paginateMarkdown(markdownContent);

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

      const fullHtmls = pages.map((page, i) => {
        const htmlContent = md.render(page);
        return this.createSlideHtml(htmlContent, i + 1);
      });

      const slides = await this.renderHtmlPagesToSlides(fullHtmls, outputDir);
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
   * @param {string} [extraCss] - Optional CSS appended before </style>
   * @returns {string} Complete HTML page
   */
  createSlideHtml(htmlContent, slideNumber, extraCss = '') {
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
        ${extraCss}
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