const fs = require('fs').promises;
const path = require('path');
const FileProcessor = require('../FileProcessor');

// Mock dependencies
jest.mock('../htmlZipSlides', () => ({
    extractZipToDirectory: jest.fn(),
    buildSlideHtmlDocumentsFromExtractedRoot: jest.fn(),
    buildSlideHtmlDocumentsFromPolyglotDeck: jest.fn()
}));
jest.mock('../polyglotDeckCapture', () => ({
    resolvePolyglotLayout: jest.fn()
}));
jest.mock('pdf-poppler');
jest.mock('sharp');
jest.mock('markdown-it');
jest.mock('puppeteer', () => ({
    launch: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
            setViewport: jest.fn().mockResolvedValue(undefined),
            setContent: jest.fn().mockResolvedValue(undefined),
            screenshot: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined)
        }),
        close: jest.fn().mockResolvedValue(undefined)
    })
}));
jest.mock('fs', () => ({
    promises: {
        stat: jest.fn(),
        mkdir: jest.fn(),
        unlink: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        access: jest.fn(),
        rm: jest.fn()
    }
}));

const mockPdf = require('pdf-poppler');
const mockSharp = require('sharp');
const mockMarkdownIt = require('markdown-it');
const mockPuppeteer = require('puppeteer');
const {
    extractZipToDirectory,
    buildSlideHtmlDocumentsFromExtractedRoot,
    buildSlideHtmlDocumentsFromPolyglotDeck
} = require('../htmlZipSlides');
const { resolvePolyglotLayout } = require('../polyglotDeckCapture');

describe('FileProcessor', () => {
    let fileProcessor;

    beforeEach(() => {
        fileProcessor = new FileProcessor();
        jest.clearAllMocks();
        fs.access.mockResolvedValue(undefined);
        extractZipToDirectory.mockResolvedValue(undefined);
        resolvePolyglotLayout.mockResolvedValue(null);
        buildSlideHtmlDocumentsFromExtractedRoot.mockResolvedValue([
            '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="slide">x</div></body></html>'
        ]);
        buildSlideHtmlDocumentsFromPolyglotDeck.mockResolvedValue([
            '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="slide">x</div></body></html>'
        ]);
        fs.rm.mockResolvedValue(undefined);

        // Setup sharp mock chain for both creation and file operations
        const mockSharpInstance = {
            resize: jest.fn().mockReturnThis(),
            png: jest.fn().mockReturnThis(),
            toFile: jest.fn().mockResolvedValue(),
            toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock image data')),
            composite: jest.fn().mockReturnThis()
        };

        // Mock both sharp() and sharp({ create: ... }) calls
        mockSharp.mockImplementation((input) => {
            if (typeof input === 'string' || Buffer.isBuffer(input) || (input && input.create)) {
                return mockSharpInstance;
            }
            return mockSharpInstance;
        });
    });

    describe('detectFormat', () => {
        test('should detect PDF format', () => {
            expect(fileProcessor.detectFormat('presentation.pdf')).toBe('.pdf');
            expect(fileProcessor.detectFormat('PRESENTATION.PDF')).toBe('.pdf');
        });

        test('should detect HacKSU presentation zip format', () => {
            expect(fileProcessor.detectFormat('deck.zip')).toBe('.zip');
            expect(fileProcessor.detectFormat('Deck.ZIP')).toBe('.zip');
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

        test('should process HacKSU presentation zip successfully', async () => {
            fs.readFile.mockResolvedValue(Buffer.from('zip-bytes'));

            const result = await fileProcessor.processFile('/temp/file.zip', 'presentation.zip');

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
                totalSlides: 1,
                createdAt: expect.any(String)
            });

            expect(extractZipToDirectory).toHaveBeenCalled();
            expect(buildSlideHtmlDocumentsFromExtractedRoot).toHaveBeenCalled();
            expect(mockPuppeteer.launch).toHaveBeenCalled();
        });

        test('should process Markdown file successfully', async () => {
            const mockMarkdown = '# Slide 1\nContent 1\n\n---\n\n# Slide 2\nContent 2';

            fs.readFile.mockResolvedValue(mockMarkdown);

            const result = await fileProcessor.processFile('/temp/file.md', 'presentation.md');

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

            expect(fs.readFile).toHaveBeenCalledWith('/temp/file.md', 'utf8');
            expect(mockPuppeteer.launch).toHaveBeenCalled();
        });
    });

    describe('convertPDF', () => {
        beforeEach(() => {
            mockPdf.convert.mockResolvedValue(['slide-1.png', 'slide-2.png', 'slide-3.png']);
        });

        test('should convert PDF and generate thumbnails with proper resolution', async () => {
            const slides = await fileProcessor.convertPDF('/path/to/file.pdf', '/output/dir');

            expect(mockPdf.convert).toHaveBeenCalledWith('/path/to/file.pdf', {
                format: 'png',
                out_dir: '/output/dir',
                out_prefix: 'slide',
                page: null,
                scale: 6144
            });

            expect(slides).toHaveLength(3);
            expect(slides[0]).toMatchObject({
                id: 'slide-1',
                imageUrl: expect.stringContaining('slide-1.png'),
                thumbnailUrl: expect.stringContaining('thumb-1.png'),
                order: 1
            });

            // Verify thumbnail generation with proper settings
            expect(mockSharp).toHaveBeenCalledTimes(3);
            const mockSharpInstance = mockSharp();
            expect(mockSharpInstance.resize).toHaveBeenCalledWith(960, 540, {
                fit: 'inside',
                withoutEnlargement: true,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            });
        });

        test('should handle PDF conversion errors', async () => {
            mockPdf.convert.mockRejectedValue(new Error('Invalid PDF'));

            await expect(
                fileProcessor.convertPDF('/path/to/invalid.pdf', '/output/dir')
            ).rejects.toThrow('PDF conversion failed: Invalid PDF');
        });
    });

    describe('convertHtmlZipPresentation', () => {
        beforeEach(() => {
            fs.readFile.mockResolvedValue(Buffer.from('zip-bytes'));
            extractZipToDirectory.mockResolvedValue(undefined);
            resolvePolyglotLayout.mockResolvedValue(null);
            buildSlideHtmlDocumentsFromExtractedRoot.mockResolvedValue([
                '<!DOCTYPE html><html><head></head><body><div class="slide">a</div></body></html>',
                '<!DOCTYPE html><html><head></head><body><div class="slide">b</div></body></html>'
            ]);
        });

        test('should convert HacKSU presentation zip via extract and Puppeteer', async () => {
            const slides = await fileProcessor.convertHtmlZipPresentation('/path/to/file.zip', '/output/dir');

            expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.zip');
            expect(extractZipToDirectory).toHaveBeenCalled();
            expect(buildSlideHtmlDocumentsFromExtractedRoot).toHaveBeenCalled();
            expect(mockPuppeteer.launch).toHaveBeenCalled();

            expect(slides).toHaveLength(2);
            expect(slides[0]).toMatchObject({
                id: 'slide-1',
                order: 1
            });
            expect(fs.rm).toHaveBeenCalled();
        });

        test('should surface empty zip slides', async () => {
            buildSlideHtmlDocumentsFromExtractedRoot.mockRejectedValueOnce(new Error('No slides found'));

            await expect(
                fileProcessor.convertHtmlZipPresentation('/x.zip', '/out')
            ).rejects.toThrow('HacKSU slides conversion failed');
        });
    });

    describe('convertMarkdown', () => {
        test('should convert markdown with horizontal rule pagination', async () => {
            const mockMarkdown = '# Slide 1\nContent 1\n\n---\n\n# Slide 2\nContent 2';
            fs.readFile.mockResolvedValue(mockMarkdown);

            const slides = await fileProcessor.convertMarkdown('/path/to/file.md', '/output/dir');

            expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.md', 'utf8');
            expect(mockPuppeteer.launch).toHaveBeenCalled();

            expect(slides).toHaveLength(2);
            expect(slides[0]).toMatchObject({
                id: 'slide-1',
                order: 1
            });
        });

        test('should convert markdown with header pagination', async () => {
            const mockMarkdown = '# Slide 1\nContent 1\n\n# Slide 2\nContent 2';
            fs.readFile.mockResolvedValue(mockMarkdown);

            const slides = await fileProcessor.convertMarkdown('/path/to/file.md', '/output/dir');

            expect(slides).toHaveLength(2);
        });

        test('should handle single slide markdown', async () => {
            const mockMarkdown = 'Single slide content without pagination';
            fs.readFile.mockResolvedValue(mockMarkdown);

            const slides = await fileProcessor.convertMarkdown('/path/to/file.md', '/output/dir');

            expect(slides).toHaveLength(1);
        });

        test('should propagate screenshot failures', async () => {
            fs.readFile.mockResolvedValue('# Test slide');
            mockPuppeteer.launch.mockResolvedValueOnce({
                newPage: jest.fn().mockResolvedValue({
                    setViewport: jest.fn().mockResolvedValue(undefined),
                    setContent: jest.fn().mockResolvedValue(undefined),
                    screenshot: jest.fn().mockRejectedValue(new Error('screenshot failed')),
                    close: jest.fn().mockResolvedValue(undefined)
                }),
                close: jest.fn().mockResolvedValue(undefined)
            });

            await expect(
                fileProcessor.convertMarkdown('/path/to/file.md', '/output/dir')
            ).rejects.toThrow('Failed to convert markdown: screenshot failed');
        });
    });

    describe('paginateMarkdown', () => {
        test('should paginate by horizontal rules', () => {
            const content = 'Page 1\n\n---\n\nPage 2\n\n---\n\nPage 3';
            const pages = fileProcessor.paginateMarkdown(content);

            expect(pages).toHaveLength(3);
            expect(pages[0]).toBe('Page 1');
            expect(pages[1]).toBe('Page 2');
            expect(pages[2]).toBe('Page 3');
        });

        test('should paginate by headers when no horizontal rules', () => {
            const content = 'Intro\n\n# Header 1\nContent 1\n\n# Header 2\nContent 2';
            const pages = fileProcessor.paginateMarkdown(content);

            expect(pages).toHaveLength(3);
            expect(pages[0]).toBe('Intro');
            expect(pages[1]).toBe('# Header 1\nContent 1');
            expect(pages[2]).toBe('# Header 2\nContent 2');
        });

        test('should handle single page content', () => {
            const content = 'Single page content without pagination markers';
            const pages = fileProcessor.paginateMarkdown(content);

            expect(pages).toHaveLength(1);
            expect(pages[0]).toBe(content);
        });

        test('should filter out empty pages', () => {
            const content = 'Page 1\n\n---\n\n\n\n---\n\nPage 2';
            const pages = fileProcessor.paginateMarkdown(content);

            expect(pages).toHaveLength(2);
            expect(pages[0]).toBe('Page 1');
            expect(pages[1]).toBe('Page 2');
        });
    });

    describe('createSlideHtml', () => {
        test('should create proper HTML structure', () => {
            const html = fileProcessor.createSlideHtml('<h1>Test Content</h1>', 1);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<h1>Test Content</h1>');
            expect(html).toContain('width: 1920px');
            expect(html).toContain('height: 1080px');
        });
    });

    describe('getSupportedFormats', () => {
        test('should return array of supported formats', () => {
            const formats = fileProcessor.getSupportedFormats();
            expect(formats).toEqual(['.pdf', '.zip', '.md']);
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