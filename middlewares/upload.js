const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'logo') {
      cb(null, ensureDir('uploads/shops/logos'));
    } else if (file.fieldname === 'cover') {
      cb(null, ensureDir('uploads/shops/covers'));
    } else if (file.fieldname === 'images') {
      cb(null, ensureDir('uploads/products'));
    } else {
      cb(new Error(`Unsupported file field: ${file.fieldname}`));
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuid() + ext); // random safe filename
  }
});

// File filter (only images)
const fileFilter = (req, file, cb) => {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Only images allowed'), false);
  }
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});
