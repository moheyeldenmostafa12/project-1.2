const express = require('express');
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  stats,
  exportSubmissionsCsv,
} = require('../controllers/adminController');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired, requireRoles('admin'));

router.get('/stats', stats);
router.get('/users', listUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/export/submissions', exportSubmissionsCsv);

module.exports = router;
