const express = require('express');
const {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} = require('../controllers/coursesController');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, listCourses);
router.get('/:id', authRequired, getCourse);
router.post('/', authRequired, requireRoles('admin'), createCourse);
router.patch('/:id', authRequired, requireRoles('doctor', 'admin'), updateCourse);
router.delete('/:id', authRequired, requireRoles('doctor', 'admin'), deleteCourse);

module.exports = router;
