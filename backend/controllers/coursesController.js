const { query } = require('../models/db');

async function listCoursesForStudent(userId) {
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

  const all = await query(
    `SELECT c.*, u.name AS doctor_name
     FROM courses c
     JOIN users u ON u.id = c.doctor_id
     ORDER BY c.id DESC`
  );

  return all.filter((c) => {
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
  });
}

async function listCourses(req, res) {
  try {
    const user = req.user;

    if (user.role === 'admin' || user.role === 'doctor') {
      let sql =
        `SELECT c.*, u.name AS doctor_name
         FROM courses c
         JOIN users u ON u.id = c.doctor_id`;
      const params = {};
      if (user.role === 'doctor') {
        sql += ` WHERE c.doctor_id = :doctorId`;
        params.doctorId = user.id;
      }
      sql += ` ORDER BY c.id DESC`;
      const rowsAll = await query(sql, params);
      return res.json({ courses: rowsAll });
    }

    const filtered = await listCoursesForStudent(user.id);
    return res.json({ courses: filtered });
  } catch (err) {
    console.error('listCourses error', err);
    return res.status(500).json({ error: 'Failed to list courses' });
  }
}

async function getCourse(req, res) {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT c.*, u.name AS doctor_name FROM courses c JOIN users u ON u.id = c.doctor_id WHERE c.id = :id LIMIT 1`,
      { id }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const course = rows[0];
    const user = req.user;
    if (user.role === 'doctor' && course.doctor_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (user.role === 'student') {
      const filtered = await listCoursesForStudent(user.id);
      const ok = filtered.some((c) => Number(c.id) === Number(course.id));
      if (!ok) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    return res.json({ course });
  } catch (err) {
    console.error('getCourse error', err);
    return res.status(500).json({ error: 'Failed to load course' });
  }
}

async function createCourse(req, res) {
  try {
    const { name, academic_year: academicYear, department, description } = req.body;
    const user = req.user;

    let doctorId = user.id;
    if (user.role === 'admin' && req.body.doctor_id !== undefined && req.body.doctor_id !== null) {
      doctorId = Number(req.body.doctor_id);
      const d = await query(`SELECT id, role FROM users WHERE id = :id LIMIT 1`, { id: doctorId });
      if (!d.length || d[0].role !== 'doctor') {
        return res.status(400).json({ error: 'doctor_id must reference a doctor user' });
      }
    } else if (user.role !== 'doctor' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Course name is required' });
    }

    const result = await query(
      `INSERT INTO courses (name, doctor_id, academic_year, department, description)
       VALUES (:name, :doctor_id, :academic_year, :department, :description)`,
      {
        name: String(name).trim(),
        doctor_id: doctorId,
        academic_year: academicYear === undefined || academicYear === '' ? null : Number(academicYear),
        department: department === undefined || department === '' ? null : String(department).trim(),
        description:
          description === undefined || description === '' ? null : String(description),
      }
    );

    const courseId = result.insertId;
    const courseNameTrim = String(name).trim();

    const students = await query(`SELECT id FROM users WHERE role = 'student'`);
    const msg = `A new course "${courseNameTrim}" has been published.`;

    await Promise.all(
      students.map((s) =>
        query(
          `INSERT INTO notifications (user_id, title, message)
           VALUES (:uid, :t, :m)`,
          {
            uid: s.id,
            t: 'New course',
            m: msg,
          }
        ).catch(() => {})
      )
    );

    const rows = await query(
      `SELECT c.*, u.name AS doctor_name FROM courses c JOIN users u ON u.id = c.doctor_id WHERE c.id = :id LIMIT 1`,
      { id: courseId }
    );

    await query(`INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`, {
      uid: doctorId,
      t: 'Course created',
      m: `You created "${courseNameTrim}". Course ID ${courseId}.`,
    }).catch(() => {});

    return res.status(201).json({ course: rows[0] });
  } catch (err) {
    console.error('createCourse error', err);
    return res.status(500).json({ error: 'Failed to create course' });
  }
}

async function updateCourse(req, res) {
  try {
    const id = Number(req.params.id);
    const existing = await query(`SELECT * FROM courses WHERE id = :id LIMIT 1`, { id });
    if (!existing.length) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const user = req.user;
    if (user.role === 'doctor' && existing[0].doctor_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { name, academic_year: academicYear, department, description, doctor_id: doctorId } = req.body;
    const updates = [];
    const params = { id };

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
    if (description !== undefined) {
      updates.push('description = :description');
      params.description = description === null ? null : String(description);
    }
    if (user.role === 'admin' && doctorId !== undefined) {
      const did = Number(doctorId);
      const d = await query(`SELECT id, role FROM users WHERE id = :id LIMIT 1`, { id: did });
      if (!d.length || d[0].role !== 'doctor') {
        return res.status(400).json({ error: 'doctor_id must reference a doctor user' });
      }
      updates.push('doctor_id = :doctor_id');
      params.doctor_id = did;
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await query(`UPDATE courses SET ${updates.join(', ')} WHERE id = :id`, params);
    const rows = await query(
      `SELECT c.*, u.name AS doctor_name FROM courses c JOIN users u ON u.id = c.doctor_id WHERE c.id = :id LIMIT 1`,
      { id }
    );
    return res.json({ course: rows[0] });
  } catch (err) {
    console.error('updateCourse error', err);
    return res.status(500).json({ error: 'Failed to update course' });
  }
}

async function deleteCourse(req, res) {
  try {
    const id = Number(req.params.id);
    const existing = await query(`SELECT * FROM courses WHERE id = :id LIMIT 1`, { id });
    if (!existing.length) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const user = req.user;
    if (user.role === 'doctor' && existing[0].doctor_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await query(`DELETE FROM courses WHERE id = :id`, { id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteCourse error', err);
    return res.status(500).json({ error: 'Failed to delete course' });
  }
}

module.exports = {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
};
