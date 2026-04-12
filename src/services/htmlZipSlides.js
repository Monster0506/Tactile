'use strict';

const fs = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');
const JSZip = require('jszip');
const cheerio = require('cheerio');
const { renderPolyglotIndexHtml } = require('./polyglotJinjaRender');

const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function safeZipEntryName(name) {
  const n = toPosix(name).replace(/^\/+/, '');
  if (!n || n.includes('..')) {
    throw new Error('Zip contains an invalid path');
  }
  return n;
}

function fileUrlForDir(dir) {
  let u = pathToFileURL(dir).href;
  if (!u.endsWith('/')) {
    u += '/';
  }
  return u;
}

/** True if candidate is extractRoot or a file/directory under it (handles relative vs absolute on Windows). */
function isPathInsideExtractRoot(extractRoot, candidatePath) {
  const root = path.resolve(extractRoot);
  const candidate = path.resolve(candidatePath);
  if (candidate === root) {
    return true;
  }
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * @param {string} siteRootDir - Directory that URL "/" maps to (zip root for flat bundles; presentation/ for HacKSU Flask-style paths).
 */
function resolveUnderExtractRoot(extractRoot, baseDir, href, siteRootDir = extractRoot) {
  if (!href || /^(https?:|\/\/|data:)/i.test(href)) {
    return null;
  }
  const clean = href.split(/[?#]/)[0];
  let resolved;
  if (clean.startsWith('/')) {
    resolved = path.resolve(siteRootDir, clean.replace(/^\/+/, ''));
  } else {
    resolved = path.resolve(baseDir, clean);
  }
  if (!isPathInsideExtractRoot(extractRoot, resolved)) {
    throw new Error(`Asset path escapes the archive: ${href}`);
  }
  return resolved;
}

async function extractZipToDirectory(buffer, destDir) {
  const zip = await JSZip.loadAsync(buffer);
  let total = 0;
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  for (const n of names) {
    const z = zip.files[n];
    total += z._data && z._data.uncompressedSize != null ? z._data.uncompressedSize : 0;
  }
  if (total > MAX_UNCOMPRESSED_BYTES) {
    throw new Error('Zip uncompressed size is too large');
  }

  await fs.mkdir(destDir, { recursive: true });

  for (const name of names) {
    const rel = safeZipEntryName(name);
    const abs = path.resolve(destDir, rel);
    if (!abs.startsWith(path.resolve(destDir))) {
      throw new Error('Zip path escapes destination directory');
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const data = await zip.files[name].async('nodebuffer');
    await fs.writeFile(abs, data);
  }
}

async function findSingleHtmlAtRoot(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const htmlFiles = entries.filter((e) => e.isFile() && /\.html?$/i.test(e.name));
  if (htmlFiles.length === 1) {
    return path.join(rootDir, htmlFiles[0].name);
  }
  return null;
}

async function findFirstIndexHtmlRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const subdirs = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === 'index.html') {
      return full;
    }
    if (e.isDirectory()) {
      subdirs.push(full);
    }
  }
  for (const sub of subdirs.sort()) {
    const hit = await findFirstIndexHtmlRecursive(sub);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * @param {string} extractRootFsPath
 * @returns {Promise<string>} Path relative to extract root (posix slashes)
 */
async function findEntryHtmlRelativePath(extractRootFsPath) {
  const preferred = [
    'index.html',
    'presentation.html',
    'slides.html',
    path.join('presentation', 'templates', 'index.html'),
    path.join('presentation', 'templates', 'presentation.html')
  ];

  for (const p of preferred) {
    const full = path.join(extractRootFsPath, p);
    try {
      await fs.access(full);
      return toPosix(p);
    } catch {
      /* next */
    }
  }

  const deep = await findFirstIndexHtmlRecursive(extractRootFsPath);
  if (deep) {
    return toPosix(path.relative(extractRootFsPath, deep));
  }

  const single = await findSingleHtmlAtRoot(extractRootFsPath);
  if (single) {
    return toPosix(path.relative(extractRootFsPath, single));
  }

  throw new Error(
    'Could not find an entry HTML file for HacKSU presentation format. Add index.html (e.g. presentation/templates/index.html), or a single .html file at the zip root.'
  );
}

/**
 * Map /static/…, /logo, etc. to relative URLs so file:// + base works in Puppeteer.
 * Leading "/" is resolved against siteRootDir (HacKSU: presentation/; flat zip: extract root).
 */
async function rewriteRootAbsolutePaths($, extractRoot, entryDir, siteRootDir = extractRoot) {
  const pairs = [
    ['link[href^="/"]', 'href'],
    ['script[src^="/"]', 'src'],
    ['img[src^="/"]', 'src'],
    ['source[src^="/"]', 'src']
  ];
  for (const [sel, attr] of pairs) {
    for (const el of $(sel).toArray()) {
      const $el = $(el);
      const v = $el.attr(attr);
      if (!v || !v.startsWith('/') || v.startsWith('//')) {
        continue;
      }
      const abs = path.resolve(siteRootDir, v.replace(/^\/+/, ''));
      if (!isPathInsideExtractRoot(extractRoot, abs)) {
        continue;
      }
      try {
        await fs.access(abs);
      } catch {
        continue;
      }
      let rel = path.relative(entryDir, abs);
      rel = rel.split(path.sep).join('/');
      $el.attr(attr, rel);
    }
  }
}

async function collectStyles($, extractRoot, entryDir, siteRootDir = extractRoot) {
  const chunks = [];

  $('style').each((_, el) => {
    const t = $(el).html();
    if (t) {
      chunks.push(t);
    }
  });

  const seen = new Set();
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      seen.add(href);
    }
  });

  for (const href of seen) {
    const abs = resolveUnderExtractRoot(extractRoot, entryDir, href, siteRootDir);
    if (!abs) {
      continue;
    }
    try {
      const text = await fs.readFile(abs, 'utf8');
      chunks.push(text);
    } catch (err) {
      console.warn('HacKSU presentation zip: skipped stylesheet', href, err.message);
    }
  }

  return chunks.join('\n\n');
}

function stripActiveClass(classStr) {
  if (!classStr) {
    return classStr;
  }
  return classStr
    .split(/\s+/)
    .filter((c) => c && c !== 'active')
    .join(' ');
}

function forceSlideVisibleCss() {
  return `
    html body .slide {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: relative !important;
    }
  `;
}

/**
 * Unzip to extractRootFsPath, find slide HTML, return one full HTML document per
 * &lt;div class="slide"&gt;…&lt;/div&gt; (linked CSS inlined, &lt;base&gt; for images/fonts).
 * @param {string} extractRootFsPath
 * @returns {Promise<string[]>}
 */
async function buildSlideHtmlDocumentsFromExtractedRoot(extractRootFsPath) {
  const entryRel = await findEntryHtmlRelativePath(extractRootFsPath);
  const entryAbs = path.join(extractRootFsPath, ...entryRel.split('/'));
  const entryDir = path.dirname(entryAbs);
  const html = await fs.readFile(entryAbs, 'utf8');
  const $ = cheerio.load(html);

  await rewriteRootAbsolutePaths($, extractRootFsPath, entryDir);

  const cssText = (await collectStyles($, extractRootFsPath, entryDir)) + '\n' + forceSlideVisibleCss();
  const baseHref = fileUrlForDir(entryDir);

  const documents = [];
  $('div.slide').each((_, el) => {
    const $el = $(el);
    const cls = stripActiveClass($el.attr('class'));
    if (cls) {
      $el.attr('class', cls);
    } else {
      $el.removeAttr('class');
    }
    const fragment = $.html($el);
    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="${baseHref}">
  <style>${cssText}</style>
</head>
<body>
${fragment}
</body>
</html>`;
    documents.push(doc);
  });

  if (documents.length === 0) {
    throw new Error(
      'No slides found in HacKSU presentation format. Use one or more elements like <div class="slide" id="slide-1">…</div> (see hacksu/polyglot presentation templates).'
    );
  }

  return documents;
}

/**
 * HacKSU repo layout with Jinja templates under presentation/templates/ (no Flask).
 * Renders index.html with Nunjucks, then splits #deck .slide like static HTML zips.
 *
 * @param {string} extractRootFsPath
 * @param {string} presentationDir
 * @returns {Promise<string[]>}
 */
async function buildSlideHtmlDocumentsFromPolyglotDeck(extractRootFsPath, presentationDir) {
  const html = await renderPolyglotIndexHtml(presentationDir);
  const entryDir = path.join(presentationDir, 'templates');
  const $ = cheerio.load(html);
  await rewriteRootAbsolutePaths($, extractRootFsPath, entryDir, presentationDir);

  const cssText =
    (await collectStyles($, extractRootFsPath, entryDir, presentationDir)) + '\n' + forceSlideVisibleCss();
  const baseHref = fileUrlForDir(entryDir);

  let slideEls = $('#deck .slide').toArray();
  if (slideEls.length === 0) {
    slideEls = $('div.slide').toArray();
  }

  const documents = [];
  for (const el of slideEls) {
    const $el = $(el);
    const cls = stripActiveClass($el.attr('class'));
    if (cls) {
      $el.attr('class', cls);
    } else {
      $el.removeAttr('class');
    }
    const fragment = $.html($el);
    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="${baseHref}">
  <style>${cssText}</style>
</head>
<body>
${fragment}
</body>
</html>`;
    documents.push(doc);
  }

  if (documents.length === 0) {
    throw new Error(
      'No slides found after rendering Jinja templates. Expected #deck .slide elements (see hacksu/polyglot).'
    );
  }

  return documents;
}

async function buildSlideHtmlDocumentsFromZipBuffer(zipBuffer, extractRootFsPath) {
  await extractZipToDirectory(zipBuffer, extractRootFsPath);
  return buildSlideHtmlDocumentsFromExtractedRoot(extractRootFsPath);
}

module.exports = {
  buildSlideHtmlDocumentsFromZipBuffer,
  buildSlideHtmlDocumentsFromExtractedRoot,
  buildSlideHtmlDocumentsFromPolyglotDeck,
  extractZipToDirectory,
  findEntryHtmlRelativePath,
  rewriteRootAbsolutePaths
};
