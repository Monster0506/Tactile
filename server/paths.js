const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  publicDir: path.join(ROOT, 'public'),
  uploadsSlides: path.join(ROOT, 'uploads', 'slides'),
  uploadsTemp: path.join(ROOT, 'uploads', 'temp')
};
