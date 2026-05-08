const bcrypt = require('bcryptjs');
const { query } = require('../models/db');

async function listUsers(req, res) {
  try {
    const rows = await query(
      `SELECT id, name, email, role, academic_year, department, created_at, updated_at
       FROM users
       ORDER BY id DESC`
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error('listUsers error', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
}

async function createUser(req, res) {
  try {
    const { name, email, password, role, academic_year: academicYear, department } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, and role are required' });
    }
    const roleNorm = String(role).toLowerCase();
    if (!['student', 'doctor', 'admin'].includes(roleNorm)) {
      return res.status(400).json({ error: 'role must be student, doctor, or admin' });
    }

    const existing = await query(`SELECT id FROM users WHERE email = :email LIMIT 1`, {
      email: String(email).toLowerCase().trim(),
    });
    if (existing.length) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, academic_year, department)
       VALUES (:name, :email, :password_hash, :role, :academic_year, :department)`,
      {
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        password_hash: passwordHash,
        role: roleNorm,
        academic_year: academicYear === undefined || academicYear === '' ? null : Number(academicYear),
        department:
          department === undefined || department === '' ? null : String(department).trim(),
      }
    );

    const id = result.insertId;
    const rows = await query(
      `SELECT id, name, email, role, academic_year, department, created_at
       FROM users WHERE id = :id LIMIT 1`,
      { id }
    );

    await query(`INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`, {
      uid: id,
      t: 'Account provisioned',
      m: `An administrator created your ${roleNorm} account for the Faculty platform.`,
    }).catch(() => {});

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('createUser error', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

async function updateUser(req, res) {
  try {
    const id = Number(req.params.id);
    const rowsExist = await query(`SELECT id, role FROM users WHERE id = :id LIMIT 1`, { id });
    if (!rowsExist.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, email, password, role, academic_year: academicYear, department } = req.body;
    const updates = [];
    const params = { id };

    if (name !== undefined) {
      updates.push('name = :name');
      params.name = String(name).trim();
    }
    if (email !== undefined) {
      updates.push('email = :email');
      params.email = String(email).toLowerCase().trim();
    }
    if (password) {
      const passwordHash = await bcrypt.hash(String(password), 10);
      updates.push('password_hash = :password_hash');
      params.password_hash = passwordHash;
    }
    if (role !== undefined) {
      const roleNorm = String(role).toLowerCase();
      if (!['student', 'doctor', 'admin'].includes(roleNorm)) {
        return res.status(400).json({ error: 'invalid role' });
      }
      updates.push('role = :role');
      params.role = roleNorm;
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

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = :id`, params);
    const rows = await query(
      `SELECT id, name, email, role, academic_year, department, created_at, updated_at
       FROM users WHERE id = :id LIMIT 1`,
      { id }
    );

    await query(`INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`, {
      uid: id,
      t: 'Account updated',
      m: 'An administrator updated your account details.',
    }).catch(() => {});

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('updateUser error', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
}

async function deleteUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account' });
    }
    const rowsExist = await query(`SELECT id FROM users WHERE id = :id LIMIT 1`, { id });
    if (!rowsExist.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    await query(`DELETE FROM users WHERE id = :id`, { id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteUser error', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}

async function stats(req, res) {
  try {
    const userAggRows = await query(
      `SELECT
         SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
         SUM(CASE WHEN role = 'doctor' THEN 1 ELSE 0 END) AS doctors,
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins,
         COUNT(*) AS total_users
       FROM users`
    );
    const userCounts = userAggRows[0] || {
      students: 0,
      doctors: 0,
      admins: 0,
      total_users: 0,
    };

    const coursesRows = await query(`SELECT COUNT(*) AS total_courses FROM courses`);
    const assignmentsRows = await query(`SELECT COUNT(*) AS total_assignments FROM assignments`);
    const submissionsRows = await query(`SELECT COUNT(*) AS total_submissions FROM submissions`);
    const materialsRows = await query(`SELECT COUNT(*) AS total_materials FROM materials`);
    const gradedRows = await query(
      `SELECT COUNT(*) AS graded_submissions FROM submissions WHERE status = 'graded'`
    );
    const pendingRows = await query(
      `SELECT COUNT(*) AS pending_submissions FROM submissions WHERE status IN ('submitted','late')`
    );

    const courseCount = coursesRows[0];
    const assignmentCount = assignmentsRows[0];
    const submissionCount = submissionsRows[0];
    const materialCount = materialsRows[0];
    const gradedCount = gradedRows[0];
    const pendingCount = pendingRows[0];

    const recentSubmissions = await query(
      `SELECT s.id, s.submitted_at, s.status, u.name AS student_name, a.title AS assignment_title
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       JOIN assignments a ON a.id = s.assignment_id
       ORDER BY s.submitted_at DESC
       LIMIT 8`
    );

    return res.json({
      users: userCounts,
      courses: courseCount,
      assignments: assignmentCount,
      submissions: submissionCount,
      materials: materialCount,
      graded: gradedCount,
      pending: pendingCount,
      recentSubmissions,
    });
  } catch (err) {
    console.error('stats error', err);
    return res.status(500).json({ error: 'Failed to load statistics' });
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function exportSubmissionsCsv(req, res) {
  try {
    const rows = await query(
      `SELECT s.id, s.submitted_at, s.graded_at, s.status, s.grade, s.feedback,
              u.id AS student_id, u.name AS student_name, u.email AS student_email,
              a.id AS assignment_id, a.title AS assignment_title, a.max_grade, a.deadline,
              c.id AS course_id, c.name AS course_name
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       ORDER BY s.id ASC`
    );

    const header = [
      'submission_id',
      'submitted_at',
      'graded_at',
      'status',
      'grade',
      'max_grade',
      'feedback',
      'student_id',
      'student_name',
      'student_email',
      'assignment_id',
      'assignment_title',
      'deadline',
      'course_id',
      'course_name',
    ];

    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.submitted_at,
          r.graded_at,
          r.status,
          r.grade,
          r.max_grade,
          r.feedback,
          r.student_id,
          r.student_name,
          r.student_email,
          r.assignment_id,
          r.assignment_title,
          r.deadline,
          r.course_id,
          r.course_name,
        ]
          .map(csvEscape)
          .join(',')
      );
    }

    const body = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions_export.csv"');
    return res.send(body);
  } catch (err) {
    console.error('exportSubmissionsCsv error', err);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  stats,
  exportSubmissionsCsv,
};
