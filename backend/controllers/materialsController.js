const { query } = require('../models/db');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function ensureDoctorOwnsCourse(doctorUserId, courseId) {
  const rows = await query(`SELECT id, doctor_id FROM courses WHERE id = :cid LIMIT 1`, {
    cid: courseId,
  });
  if (!rows.length) {
    return { ok: false, status: 404, error: 'Course not found' };
  }
  if (rows[0].doctor_id !== doctorUserId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true };
}

async function listMaterials(req, res) {
  try {
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;
    let sql = `
      SELECT m.*, u.name AS uploader_name, c.name AS course_name, c.doctor_id AS course_doctor_id
      FROM materials m
      JOIN users u ON u.id = m.uploaded_by
      JOIN courses c ON c.id = m.course_id`;
    const params = {};
    const user = req.user;

    if (courseId) {
      sql += ` WHERE m.course_id = :courseId`;
      params.courseId = courseId;
      const cRows = await query(`SELECT * FROM courses WHERE id = :cid LIMIT 1`, { cid: courseId });
      if (!cRows.length) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const courseRow = cRows[0];
      if (user.role === 'doctor' && courseRow.doctor_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (user.role === 'student') {
        const ok = await studentCanSeeCourse(user.id, courseId);
        if (!ok) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
    } else if (user.role === 'doctor') {
      sql += ` WHERE c.doctor_id = :doctorId`;
      params.doctorId = user.id;
    } else if (user.role === 'student') {
      const ids = await getStudentCourseIds(user.id);
      if (!ids.length) {
        return res.json({ materials: [] });
      }
      sql += ` WHERE m.course_id IN (${ids.join(',')})`;
    }

    sql += ` ORDER BY m.id DESC`;
    const rowsOut = await query(sql, params);
    return res.json({ materials: rowsOut });
  } catch (err) {
    console.error('listMaterials error', err);
    return res.status(500).json({ error: 'Failed to list materials' });
  }
}

async function getStudentCourseIds(userId) {
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

  const all = await query(`SELECT * FROM courses ORDER BY id DESC`);
  return all
    .filter((c) => {
      const openCourse = c.academic_year == null && (c.department == null || c.department === '');
      if (openCourse) return true;
      if (sy !== null && c.academic_year != null && Number(c.academic_year) === sy) return true;
      if (sd !== null && c.department != null) {
        const cd = String(c.department).toLowerCase();
        const sdLow = sd.toLowerCase();
        if (cd === sdLow || sdLow.includes(cd) || cd.includes(sdLow)) return true;
      }
      return false;
    })
    .map((c) => c.id);
}

async function studentCanSeeCourse(userId, courseId) {
  const ids = await getStudentCourseIds(userId);
  return ids.includes(Number(courseId));
}

async function deleteMaterial(req, res) {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT m.*, c.doctor_id AS course_doctor_id
       FROM materials m
       JOIN courses c ON c.id = m.course_id
       WHERE m.id = :id LIMIT 1`,
      { id }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Material not found' });
    }
    const m = rows[0];
    const user = req.user;
    if (user.role === 'admin') {
      await query(`DELETE FROM materials WHERE id = :id`, { id });
      return res.json({ ok: true });
    }
    if (user.role !== 'doctor' || m.course_doctor_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await query(`DELETE FROM materials WHERE id = :id`, { id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteMaterial error', err);
    return res.status(500).json({ error: 'Failed to delete material' });
  }
}

async function uploadToCloudinary(filePath, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        folder: folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
  });
}

async function createMaterial(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'doctor' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const courseId = Number(req.body.course_id);
    if (!courseId || !req.file) {
      return res.status(400).json({ error: 'course_id and file are required' });
    }
    const title = req.body.title ? String(req.body.title).trim() : req.file.originalname;

    if (user.role === 'doctor') {
      const check = await ensureDoctorOwnsCourse(user.id, courseId);
      if (!check.ok) {
        return res.status(check.status).json({ error: check.error });
      }
    } else {
      const c = await query(`SELECT id FROM courses WHERE id = :cid LIMIT 1`, { cid: courseId });
      if (!c.length) {
        return res.status(404).json({ error: 'Course not found' });
      }
    }

    const fileUrl = await uploadToCloudinary(req.file.path, 'materials');

    const uploaderId = user.role === 'admin' && req.body.uploaded_by
      ? Number(req.body.uploaded_by)
      : user.id;
    if (user.role === 'admin' && req.body.uploaded_by) {
      const u = await query(`SELECT id, role FROM users WHERE id = :id LIMIT 1`, { id: uploaderId });
      if (!u.length || u[0].role !== 'doctor') {
        return res.status(400).json({ error: 'uploaded_by must be a doctor' });
      }
    }

    const result = await query(
      `INSERT INTO materials (course_id, title, file_url, uploaded_by)
       VALUES (:course_id, :title, :file_url, :uploaded_by)`,
      {
        course_id: courseId,
        title,
        file_url: fileUrl,
        uploaded_by: uploaderId,
      }
    );

    const mid = result.insertId;
    const rowsOut = await query(
      `SELECT m.*, u.name AS uploader_name, c.name AS course_name
       FROM materials m
       JOIN users u ON u.id = m.uploaded_by
       JOIN courses c ON c.id = m.course_id
       WHERE m.id = :id LIMIT 1`,
      { id: mid }
    );

    const students = await query(`SELECT id FROM users WHERE role = 'student'`);
    const msg = `New material "${title}" uploaded for course ${rowsOut[0].course_name}.`;
    await Promise.all(
      students.map((s) =>
        query(
          `INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`,
          { uid: s.id, t: 'New material', m: msg }
        ).catch(() => {})
      )
    );

    return res.status(201).json({ material: rowsOut[0] });
  } catch (err) {
    console.error('createMaterial error', err);
    return res.status(500).json({ error: 'Failed to upload material' });
  }
}

module.exports = {
  listMaterials,
  deleteMaterial,
  createMaterial,
};
