const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} = require('../controllers/assignmentsController');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();
const maxMb = Number(process.env.MAX_UPLOAD_MB || 10);
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'assignments');

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

function fileFilterAssignment(req, file, cb) {
  const allowedExt = /\.(pdf|zip|rar|doc|docx|ppt|pptx|jpg|jpeg|png|txt|xlsx|xls)$/i;
  const allowedMime = /^application\/|^image\/|^text\//i;
  if (allowedExt.test(file.originalname) || allowedMime.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
}

const assignmentUploadSingle = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: fileFilterAssignment,
}).single('file');

function uploadAssignmentMiddleware(req, res, next) {
  assignmentUploadSingle(req, res, function handleMulter(err) {
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

router.get('/', authRequired, listAssignments);
router.get('/:id', authRequired, getAssignment);
router.post('/', authRequired, requireRoles('doctor', 'admin'), uploadAssignmentMiddleware, createAssignment);
router.patch('/:id', authRequired, requireRoles('doctor', 'admin'), updateAssignment);
router.delete('/:id', authRequired, requireRoles('doctor', 'admin'), deleteAssignment);

module.exports = router;
