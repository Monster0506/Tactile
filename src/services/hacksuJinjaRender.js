'use strict';

const fs = require('fs').promises;
const path = require('path');
const nunjucks = require('nunjucks');

const { findDemoC } = require('./hacksuDeckCapture');

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Variables expected by HacKSU slide Jinja templates (see presentation/app.py).
 * Extend here if you add new template variables.
 */
async function loadHacksuTemplateContext(presentationDir) {
  const demoPath =
    (await findDemoC(presentationDir)) || (await findDemoC(path.dirname(presentationDir)));
  if (!demoPath) {
    throw new Error(
      'HacKSU slides format needs examples/demo.c. Zip the repo so examples/ sits next to presentation/ (same layout as the HacKSU slide repo).'
    );
  }
  const repoRoot = path.dirname(path.dirname(demoPath));
  const demo_c = await fs.readFile(demoPath, 'utf8');
  let bash_python = '';
  const bashPath = path.join(repoRoot, 'examples', 'bash_python.sh');
  if (await fileExists(bashPath)) {
    bash_python = await fs.readFile(bashPath, 'utf8');
  }
  return { demo_c, bash_python };
}

/**
 * Render presentation/templates/index.html with Nunjucks (Jinja-compatible syntax for this deck).
 *
 * @param {string} presentationDir - Path to presentation/ (contains templates/)
 * @returns {Promise<string>} Full HTML document
 */
async function renderHacksuIndexHtml(presentationDir) {
  const templatesDir = path.join(presentationDir, 'templates');
  const indexTpl = path.join(templatesDir, 'index.html');
  if (!(await fileExists(indexTpl))) {
    throw new Error('Expected presentation/templates/index.html for this HacKSU slides deck.');
  }
  const ctx = await loadHacksuTemplateContext(presentationDir);
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir), {
    autoescape: true,
    throwOnUndefined: false
  });
  return env.render('index.html', ctx);
}

module.exports = {
  renderHacksuIndexHtml,
  loadHacksuTemplateContext
};
