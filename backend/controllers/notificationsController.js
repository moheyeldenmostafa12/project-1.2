const { query } = require('../models/db');

async function listMyNotifications(req, res) {
  try {
    const rows = await query(
      `SELECT id, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = :uid
       ORDER BY is_read ASC, created_at DESC
       LIMIT 200`,
      { uid: req.user.id }
    );
    return res.json({ notifications: rows });
  } catch (err) {
    console.error('listMyNotifications error', err);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
}

async function markRead(req, res) {
  try {
    const id = Number(req.params.id);
    const found = await query(
      `SELECT id FROM notifications WHERE id = :id AND user_id = :uid LIMIT 1`,
      { id, uid: req.user.id }
    );
    if (!found.length) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    await query(
      `UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :uid`,
      { id, uid: req.user.id }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('markRead error', err);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
}

async function markAllRead(req, res) {
  try {
    await query(`UPDATE notifications SET is_read = 1 WHERE user_id = :uid`, {
      uid: req.user.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('markAllRead error', err);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
}

module.exports = {
  listMyNotifications,
  markRead,
  markAllRead,
};
