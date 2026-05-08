const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../models/db');
const { friendlyDbMessage } = require('../utils/dbErrors');
require('dotenv').config();

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res) {
  return res.status(403).json({
    error: 'Account creation is restricted. Please contact an administrator.',
  });
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const rows = await query(
      `SELECT id, name, email, password_hash, role, academic_year, department, created_at
       FROM users WHERE email = :email LIMIT 1`,
      { email: String(email).toLowerCase().trim() }
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userRow = rows[0];
    const ok = await bcrypt.compare(String(password), userRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    delete userRow.password_hash;
    const token = signToken(userRow);

    return res.json({ token, user: userRow });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: friendlyDbMessage(err) });
  }
}

async function me(req, res) {
  try {
    const rows = await query(
      `SELECT id, name, email, role, academic_year, department, created_at, updated_at
       FROM users WHERE id = :id LIMIT 1`,
      { id: req.user.id }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
}

async function updateProfile(req, res) {
  try {
    const { name, academic_year: academicYear, department, password, current_password: currentPassword } =
      req.body;

    const rows = await query(
      `SELECT id, password_hash FROM users WHERE id = :id LIMIT 1`,
      { id: req.user.id }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = [];
    const params = { id: req.user.id };

    if (name !== undefined) {
      updates.push('name = :name');
      params.name = String(name).trim();
    }
    if (academicYear !== undefined) {
      updates.push('academic_year = :academic_year');
      params.academic_year =
        academicYear === '' || academicYear === null ? null : Number(academicYear);
    }
    if (department !== undefined) {
      updates.push('department = :department');
      params.department =
        department === '' || department === null ? null : String(department).trim();
    }

    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to set a new password' });
      }
      const match = await bcrypt.compare(String(currentPassword), rows[0].password_hash);
      if (!match) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const newHash = await bcrypt.hash(String(password), 10);
      updates.push('password_hash = :password_hash');
      params.password_hash = newHash;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = :id`;
    await query(sql, params);

    const fresh = await query(
      `SELECT id, name, email, role, academic_year, department, created_at, updated_at
       FROM users WHERE id = :id LIMIT 1`,
      { id: req.user.id }
    );

    await query(
      `INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`,
      {
        uid: req.user.id,
        t: 'Profile updated',
        m: 'Your profile information was saved successfully.',
      }
    );

    return res.json({ user: fresh[0] });
  } catch (err) {
    console.error('updateProfile error', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

module.exports = {
  register,
  login,
  me,
  updateProfile,
};
