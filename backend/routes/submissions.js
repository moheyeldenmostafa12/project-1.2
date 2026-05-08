const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { listSubmissions, createSubmission, gradeSubmission } = require('../controllers/submissionsController');
const { authRequired, requireRoles } = require('../middleware/auth');

require('dotenv').config();

const maxMb = Number(process.env.MAX_UPLOAD_MB || 10);
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'submissions');

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

function fileFilterSubmission(req, file, cb) {
  const allowedExt = /\.(pdf|zip|rar|doc|docx|ppt|pptx|jpg|jpeg|png|txt)$/i;
  const allowedMime = /^application\/(pdf|zip|octet-stream|x-zip-compressed)\b|^image\/|^text\/|^application\/vnd\.(ms-|open)/i;
  if (allowedExt.test(file.originalname) || allowedMime.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
}

const router = express.Router();

const submissionUploadSingle = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: fileFilterSubmission,
}).single('file');

function uploadSubmissionMiddleware(req, res, next) {
  submissionUploadSingle(req, res, function handleMulter(err) {
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

router.get('/', authRequired, listSubmissions);
router.post(
  '/',
  authRequired,
  requireRoles('student'),
  uploadSubmissionMiddleware,
  createSubmission
);
router.patch('/:id/grade', authRequired, requireRoles('doctor', 'admin'), gradeSubmission);

module.exports = router;
