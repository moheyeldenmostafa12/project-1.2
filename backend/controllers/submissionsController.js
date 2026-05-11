const { query } = require('../models/db');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(filePath, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        folder: folder,
        resource_type: 'raw',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
  });
}

async function getAssignmentWithCourse(assignmentId) {
  return query(
    `SELECT a.*, c.doctor_id AS course_doctor_id, c.name AS course_name
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.id = :id LIMIT 1`,
    { id: assignmentId }
  );
}

async function assertStudentCanAccessAssignment(userId, assignmentRow) {
  const meRows = await query(
    `SELECT academic_year, department FROM users WHERE id = :id LIMIT 1`,
    { id: userId }
  );
  const me = meRows[0] || {};
  const sy = me.academic_year === null || me.academic_year === undefined ? null : Number(me.academic_year);
  const sd =
    me.department && String(me.department).trim().length > 0
      ? String(me.department).trim()
      : null;

  const cRows = await query(`SELECT * FROM courses WHERE id = :cid LIMIT 1`, {
    cid: assignmentRow.course_id,
  });
  if (!cRows.length) {
    return false;
  }
  const c = cRows[0];
  const openCourse = c.academic_year == null && (c.department == null || c.department === '');
  if (openCourse) {
    return true;
  }
  if (sy !== null && c.academic_year != null && Number(c.academic_year) === sy) {
    return true;
  }
  if (sd !== null && c.department != null) {
    const cd = String(c.department).toLowerCase();
    const sdLow = sd.toLowerCase();
    if (cd === sdLow || sdLow.includes(cd) || cd.includes(sdLow)) {
      return true;
    }
  }
  return false;
}

async function listSubmissions(req, res) {
  try {
    const user = req.user;
    const assignmentId = req.query.assignment_id ? Number(req.query.assignment_id) : null;
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;

    if (user.role === 'student') {
      let sql = `
        SELECT s.*, a.title AS assignment_title, a.deadline, a.max_grade, a.course_id,
               c.name AS course_name
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN courses c ON c.id = a.course_id
        WHERE s.user_id = :uid`;
      const params = { uid: user.id };
      if (assignmentId) {
        sql += ` AND s.assignment_id = :aid`;
        params.aid = assignmentId;
      }
      sql += ` ORDER BY s.submitted_at DESC`;
      const rowsOut = await query(sql, params);
      return res.json({ submissions: rowsOut });
    }

    if (user.role === 'doctor') {
      let sql = `
        SELECT s.*, a.title AS assignment_title, a.deadline, a.max_grade, a.course_id,
               c.name AS course_name, u.name AS student_name, u.email AS student_email
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN courses c ON c.id = a.course_id
        JOIN users u ON u.id = s.user_id
        WHERE c.doctor_id = :did`;
      const params = { did: user.id };
      if (assignmentId) {
        sql += ` AND s.assignment_id = :aid`;
        params.aid = assignmentId;
      }
      if (courseId) {
        sql += ` AND a.course_id = :cid`;
        params.cid = courseId;
      }
      sql += ` ORDER BY s.submitted_at DESC`;
      const rowsOut = await query(sql, params);
      return res.json({ submissions: rowsOut });
    }

    let sql = `
      SELECT s.*, a.title AS assignment_title, a.deadline, a.max_grade, a.course_id,
             c.name AS course_name, u.name AS student_name, u.email AS student_email
      FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = s.user_id
      WHERE 1=1`;
    const params = {};
    if (assignmentId) {
      sql += ` AND s.assignment_id = :aid`;
      params.aid = assignmentId;
    }
    if (courseId) {
      sql += ` AND a.course_id = :cid`;
      params.cid = courseId;
    }
    sql += ` ORDER BY s.submitted_at DESC`;
    const rowsOut = await query(sql, params);
    return res.json({ submissions: rowsOut });
  } catch (err) {
    console.error('listSubmissions error', err);
    return res.status(500).json({ error: 'Failed to list submissions' });
  }
}

async function createSubmission(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can submit assignments' });
    }
    const assignmentId = Number(req.body.assignment_id);
    if (!assignmentId || !req.file) {
      return res.status(400).json({ error: 'assignment_id and file are required' });
    }

    const aRows = await getAssignmentWithCourse(assignmentId);
    if (!aRows.length) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const aRow = aRows[0];
    const can = await assertStudentCanAccessAssignment(user.id, aRow);
    if (!can) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const deadline = new Date(aRow.deadline);
    const now = new Date();
    const isLate = now > deadline;

    const existing = await query(
      `SELECT id FROM submissions WHERE user_id = :uid AND assignment_id = :aid LIMIT 1`,
      { uid: user.id, aid: assignmentId }
    );
    if (existing.length) {
      return res.status(409).json({ error: 'You already submitted this assignment' });
    }

    const fileUrl = await uploadToCloudinary(req.file.path, 'submissions');
    const status = isLate ? 'late' : 'submitted';

    const result = await query(
      `INSERT INTO submissions (user_id, assignment_id, file_url, status)
       VALUES (:user_id, :assignment_id, :file_url, :status)`,
      {
        user_id: user.id,
        assignment_id: assignmentId,
        file_url: fileUrl,
        status,
      }
    );
    const sid = result.insertId;

    await query(
      `INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`,
      {
        uid: user.id,
        t: 'Submission received',
        m: `Your submission for "${aRow.title}" was recorded${isLate ? ' (marked late)' : ''}.`,
      }
    ).catch(() => {});

    if (aRow.course_doctor_id) {
      await query(
        `INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`,
        {
          uid: aRow.course_doctor_id,
          t: 'New submission',
          m: `A student submitted work for "${aRow.title}" (${aRow.course_name}).`,
        }
      ).catch(() => {});
    }

    const rowsOut = await query(
      `SELECT s.*, a.title AS assignment_title, a.deadline, a.max_grade
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = :id LIMIT 1`,
      { id: sid }
    );

    return res.status(201).json({ submission: rowsOut[0] });
  } catch (err) {
    console.error('createSubmission error', err);
    return res.status(500).json({ error: 'Failed to submit assignment' });
  }
}

async function gradeSubmission(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'doctor' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const id = Number(req.params.id);
    const { grade, feedback } = req.body;

    const rows = await query(
      `SELECT s.*, a.max_grade, a.title AS assignment_title, c.doctor_id AS course_doctor_id
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       WHERE s.id = :id LIMIT 1`,
      { id }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    const sub = rows[0];
    if (user.role === 'doctor' && sub.course_doctor_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const g = grade === undefined || grade === null || grade === '' ? null : Number(grade);
    if (g === null || Number.isNaN(g)) {
      return res.status(400).json({ error: 'grade is required' });
    }
    if (g < 0 || g > Number(sub.max_grade)) {
      return res.status(400).json({ error: `Grade must be between 0 and ${sub.max_grade}` });
    }

    await query(
      `UPDATE submissions
       SET grade = :grade, status = 'graded', graded_at = NOW(),
           feedback = :feedback
       WHERE id = :id`,
      {
        id,
        grade: g,
        feedback: feedback === undefined || feedback === null ? null : String(feedback),
      }
    );

    await query(
      `INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`,
      {
        uid: sub.user_id,
        t: 'Grade published',
        m: `Your submission for "${sub.assignment_title}" was graded: ${g} / ${sub.max_grade}.`,
      }
    ).catch(() => {});

    const out = await query(
      `SELECT s.*, a.title AS assignment_title, a.deadline, a.max_grade
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = :id LIMIT 1`,
      { id }
    );
    return res.json({ submission: out[0] });
  } catch (err) {
    console.error('gradeSubmission error', err);
    return res.status(500).json({ error: 'Failed to grade submission' });
  }
}

module.exports = {
  listSubmissions,
  createSubmission,
  gradeSubmission,
};
