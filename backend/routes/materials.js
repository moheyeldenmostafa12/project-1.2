const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { listMaterials, createMaterial, deleteMaterial } = require('../controllers/materialsController');
const { authRequired, requireRoles } = require('../middleware/auth');

require('dotenv').config();

const maxMb = Number(process.env.MAX_UPLOAD_MB || 10);
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'materials');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

function fileFilterMaterial(req, file, cb) {
  const allowedExt = /\.(pdf|zip|rar|doc|docx|ppt|pptx|jpg|jpeg|png|txt|xlsx|xls)$/i;
  const allowedMime = /^application\/|^image\/|^text\//i;
  if (allowedExt.test(file.originalname) || allowedMime.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
}

const router = express.Router();

const materialUploadSingle = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: fileFilterMaterial,
}).single('file');

function uploadMaterialMiddleware(req, res, next) {
  materialUploadSingle(req, res, function handleMulter(err) {
    if (err) {
      const msg =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? `Maximum file size is ${maxMb}MB`
          : err.message || 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    return next();
  });
}

router.get('/', authRequired, listMaterials);
router.post(
  '/',
  authRequired,
  requireRoles('doctor', 'admin'),
  uploadMaterialMiddleware,
  createMaterial
);
router.delete('/:id', authRequired, requireRoles('doctor', 'admin'), deleteMaterial);

module.exports = router;
