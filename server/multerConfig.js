const path = require('path');
const multer = require('multer');

function createUploadMiddleware() {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      cb(null, 'uploads/temp/');
    },
    filename(req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  return multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const allowedTypes = ['.pdf', '.ppt', '.pptx', '.md'];
      const fileExt = path.extname(file.originalname).toLowerCase();
      if (allowedTypes.includes(fileExt)) {
        cb(null, true);
      } else {
        cb(new Error('Unsupported file format. Supported formats: PDF, PowerPoint, Markdown'));
      }
    }
  });
}

module.exports = { createUploadMiddleware };
