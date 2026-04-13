'use strict';

const path = require('path');
const fs = require('fs').promises;

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} extractRoot - Where the zip was extracted
 * @returns {Promise<{ presentationDir: string } | null>}
 */
async function resolveHacksuLayout(extractRoot) {
  const nestedApp = path.join(extractRoot, 'presentation', 'app.py');
  const flatApp = path.join(extractRoot, 'app.py');
  if (await fileExists(nestedApp)) {
    return { presentationDir: path.join(extractRoot, 'presentation') };
  }
  if (await fileExists(flatApp)) {
    return { presentationDir: extractRoot };
  }
  return null;
}

/**
 * Walk parents to find examples/demo.c (HacKSU repo layout).
 * @param {string} startDir
 * @returns {Promise<string | null>} Absolute path to demo.c
 */
async function findDemoC(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const demo = path.join(dir, 'examples', 'demo.c');
    if (await fileExists(demo)) {
      return demo;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

module.exports = {
  resolveHacksuLayout,
  findDemoC
};
