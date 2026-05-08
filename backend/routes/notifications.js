const express = require('express');
const { listMyNotifications, markRead, markAllRead } = require('../controllers/notificationsController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, listMyNotifications);
router.patch('/read-all', authRequired, markAllRead);
router.patch('/:id/read', authRequired, markRead);

module.exports = router;
