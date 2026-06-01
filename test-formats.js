#!/usr/bin/env node
/**
 * Manual smoke test for all 3 supported formats: .pdf, .zip, .md
 * Generates sample files on the fly, runs them through FileProcessor, and reports results.
 */

const fs = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');
const FileProcessor = require('./src/services/FileProcessor');

const TMP = path.join(__dirname, 'uploads/temp/smoke-test');
const OUT = path.join(__dirname, 'uploads/slides/smoke-test');

async function setup() {
  await fs.mkdir(TMP, { recursive: true });
  await fs.mkdir(OUT, { recursive: true });
}

async function cleanup() {
  await fs.rm(TMP, { recursive: true, force: true });
  await fs.rm(OUT, { recursive: true, force: true });
}

// --- sample file generators ---

async function makePdf(destPath) {
  // Use puppeteer (already a dep) to print a simple HTML page to PDF
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .slide { width: 100%; height: 100vh; padding: 60px; display: flex; flex-direction: column; justify-content: center; page-break-after: always; font-family: sans-serif; }
</style></head><body>
  <div class="slide" style="background:#1a1a2e;color:#fff">
    <h1 style="font-size:48px;color:#4a90d9">Page 1</h1>
    <p style="margin-top:20px;font-size:24px">First page of the test PDF</p>
  </div>
  <div class="slide" style="background:#16213e;color:#fff">
    <h1 style="font-size:48px;color:#e9944a">Page 2</h1>
    <p style="margin-top:20px;font-size:24px">Second page of the test PDF</p>
  </div>
  <div class="slide" style="background:#0f3460;color:#fff">
    <h1 style="font-size:48px;color:#53d8fb">Page 3</h1>
    <p style="margin-top:20px;font-size:24px">Third page of the test PDF</p>
  </div>
</body></html>`);
    await page.pdf({ path: destPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    await browser.close();
  }
}

async function makeZip(destPath) {
  const zip = new JSZip();
  zip.file('index.html', `<!DOCTYPE html>
<html><body>
<div class="slide" style="background:#1a1a2e;color:#fff;padding:40px">
  <h1>ZIP Slide 1</h1><p>Plain HTML zip presentation</p>
</div>
<div class="slide" style="background:#16213e;color:#fff;padding:40px">
  <h1>ZIP Slide 2</h1><p>Second slide</p>
</div>
</body></html>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(destPath, buf);
}

async function makeHacKSUZip(destPath) {
  const zip = new JSZip();

  // Minimal examples/demo.c required by hacksuJinjaRender
  zip.file('examples/demo.c', `#include <stdio.h>
int main() {
    printf("Hello, HacKSU!\\n");
    return 0;
}`);

  // Minimal presentation/app.py - presence triggers HacKSU slides path
  zip.file('presentation/app.py', `from flask import Flask\napp = Flask(__name__)\n`);

  // Jinja template - uses {{ demo_c }} injected by renderHacksuIndexHtml
  zip.file('presentation/templates/index.html', `<!DOCTYPE html>
<html><head>
<style>
  body { margin: 0; font-family: sans-serif; }
  #deck { width: 100%; }
  .slide { width: 100%; height: 100vh; display: flex; flex-direction: column;
           justify-content: center; padding: 60px; color: #fff; }
  pre { background: rgba(0,0,0,0.4); padding: 20px; border-radius: 8px;
        font-size: 16px; overflow: auto; white-space: pre-wrap; }
</style>
</head><body>
<div id="deck">
  <div class="slide" style="background:#1b1b2f">
    <h1 style="font-size:48px;color:#e94560">HacKSU Slides</h1>
    <p style="font-size:24px;margin-top:16px">Jinja-rendered slide deck</p>
  </div>
  <div class="slide" style="background:#16213e">
    <h1 style="font-size:36px;color:#0f3460">demo.c</h1>
    <pre><code>{{ demo_c }}</code></pre>
  </div>
  <div class="slide" style="background:#0f3460">
    <h1 style="font-size:48px;color:#53d8fb">The End</h1>
    <p style="font-size:24px;margin-top:16px">Slide 3 of 3</p>
  </div>
</div>
</body></html>`);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(destPath, buf);
}

async function makeMd(destPath) {
  await fs.writeFile(destPath, `# Markdown Slide 1

Content for the **first** slide.

---

# Markdown Slide 2

Content for the _second_ slide.

---

# Markdown Slide 3

Content for the third slide.
`);
}

// --- runner ---

async function run(label, filePath, originalName, fp) {
  process.stdout.write(`  ${label} ... `);
  const start = Date.now();
  try {
    const result = await fp.processFile(filePath, originalName);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`OK  (${result.totalSlides} slides, ${elapsed}s)`);
    result.slides.forEach(s => console.log(`      slide ${s.order}: ${s.imageUrl}`));
    return true;
  } catch (err) {
    console.log(`FAIL\n    ${err.message}`);
    return false;
  }
}

(async () => {
  await setup();
  const fp = new FileProcessor();
  const results = [];

  console.log('\nGenerating sample files...');

  const pdfPath    = path.join(TMP, 'sample.pdf');
  const zipPath    = path.join(TMP, 'sample.zip');
  const hacksuPath = path.join(TMP, 'hacksu.zip');
  const mdPath     = path.join(TMP, 'sample.md');

  await Promise.all([
    makePdf(pdfPath),
    makeZip(zipPath),
    makeHacKSUZip(hacksuPath),
    makeMd(mdPath),
  ]);
  console.log('Done.\n');

  console.log('Running FileProcessor against each format:');
  results.push(await run('PDF (.pdf)         ', pdfPath,    'sample.pdf',  fp));
  results.push(await run('ZIP plain HTML     ', zipPath,    'sample.zip',  fp));
  results.push(await run('ZIP HacKSU slides  ', hacksuPath, 'hacksu.zip',  fp));
  results.push(await run('MD  (.md)          ', mdPath,     'sample.md',   fp));

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed.\n`);

  await cleanup();
  process.exit(passed === results.length ? 0 : 1);
})();
