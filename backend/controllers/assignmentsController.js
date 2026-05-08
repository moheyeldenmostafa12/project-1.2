const { query } = require('../models/db');

function normalizeDatetimeInput(raw) {
  let s = String(raw || '').trim();
  if (!s) {
    return s;
  }

  s = s.replace('T', ' ');

  const parts = s.split(' ');
  const datePart = parts[0];
  let timePart = parts[1] || '00:00:00';

  const segs = timePart.split(':');
  while (segs.length < 3) {
    segs.push('00');
  }

  timePart = segs.slice(0, 3).join(':');
  const out = `${datePart} ${timePart}`;
  return out.slice(0, 19);
}

async function assertCourseAccessForDoctorOrAdmin(user, courseId) {
  const rows = await query(`SELECT id, doctor_id FROM courses WHERE id = :cid LIMIT 1`, {
    cid: courseId,
  });
  if (!rows.length) {
    return { ok: false, status: 404, error: 'Course not found' };
  }
  if (user.role === 'admin') {
    return { ok: true, course: rows[0] };
  }
  if (user.role !== 'doctor' || rows[0].doctor_id !== user.id) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, course: rows[0] };
}

async function listAssignments(req, res) {
  try {
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;
    const user = req.user;

    let sql = `
      SELECT a.*, c.name AS course_name, c.doctor_id AS course_doctor_id
      FROM assignments a
      JOIN courses c ON c.id = a.course_id`;
    const params = {};

    if (courseId) {
      sql += ` WHERE a.course_id = :courseId`;
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
        const filtered = await filterStudentCourses(courseRow.id, user.id);
        if (!filtered) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
    }

    if (user.role === 'doctor' && !courseId) {
      sql += ` WHERE c.doctor_id = :doctorId`;
      params.doctorId = user.id;
    }

    sql += ` ORDER BY a.deadline ASC`;

    let rowsOut = [];

    if (user.role === 'student' && !courseId) {
      const enrolledIds = await getStudentAccessibleCourseIds(user.id);
      if (!enrolledIds.length) {
        return res.json({ assignments: [] });
      }
      const out = [];
      for (const cid of enrolledIds) {
        const r = await query(
          `SELECT a.*, c.name AS course_name, c.doctor_id AS course_doctor_id
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.course_id = :cid
           ORDER BY a.deadline ASC`,
          { cid }
        );
        out.push(...r);
      }
      out.sort((x, y) => new Date(x.deadline) - new Date(y.deadline));
      rowsOut = out;
    } else {
      rowsOut = await query(sql, params);
    }

    return res.json({ assignments: rowsOut });
  } catch (err) {
    console.error('listAssignments error', err);
    return res.status(500).json({ error: 'Failed to list assignments' });
  }
}

async function getStudentAccessibleCourseIds(userId) {
  const lists = await listCoursesFiltered(userId);
  return lists.map((c) => c.id);
}

async function listCoursesFiltered(userId) {
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
  return all.filter((c) => {
    const openCourse = c.academic_year == null && (c.department == null || c.department === '');
    if (openCourse) return true;
    if (sy !== null && c.academic_year != null && Number(c.academic_year) === sy) return true;
    if (sd !== null && c.department != null) {
      const cd = String(c.department).toLowerCase();
      const sdLow = sd.toLowerCase();
      if (cd === sdLow || sdLow.includes(cd) || cd.includes(sdLow)) return true;
    }
    return false;
  });
}

async function filterStudentCourses(cid, uid) {
  const allowed = await listCoursesFiltered(uid);
  return allowed.some((c) => Number(c.id) === Number(cid));
}

async function getAssignment(req, res) {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT a.*, c.name AS course_name, c.doctor_id AS course_doctor_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.id = :id LIMIT 1`,
      { id }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const a = rows[0];
    const user = req.user;
    if (user.role === 'doctor' && a.course_doctor_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (user.role === 'student') {
      const ok = await filterStudentCourses(a.course_id, user.id);
      if (!ok) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    return res.json({ assignment: a });
  } catch (err) {
    console.error('getAssignment error', err);
    return res.status(500).json({ error: 'Failed to load assignment' });
  }
}

async function createAssignment(req, res) {
  try {
    const { course_id: courseIdRaw, title, deadline, max_grade: maxGrade, description } = req.body;
    const courseId = Number(courseIdRaw);
    if (!courseId || !title || !deadline) {
      return res.status(400).json({ error: 'course_id, title, and deadline are required' });
    }

    const access = await assertCourseAccessForDoctorOrAdmin(req.user, courseId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const maxG = 100;
    if (Number.isNaN(maxG) || maxG <= 0) {
      return res.status(400).json({ error: 'max_grade must be a positive number' });
    }

    const normalizedDeadline = normalizeDatetimeInput(deadline);

    const result = await query(
      `INSERT INTO assignments (course_id, title, deadline, max_grade, description)
       VALUES (:course_id, :title, :deadline, :max_grade, :description)`,
      {
        course_id: courseId,
        title: String(title).trim(),
        deadline: normalizedDeadline,
        max_grade: maxG,
        description: description === undefined || description === '' ? null : String(description),
      }
    );

    const aid = result.insertId;

    if (req.file) {
      const fileUrl = `/uploads/assignments/${req.file.filename}`;
      await query(
        `INSERT INTO materials (course_id, title, file_url, uploaded_by)
         VALUES (:course_id, :title, :file_url, :uploaded_by)`,
        {
          course_id: courseId,
          title: `${String(title).trim()} - Assignment File`,
          file_url: fileUrl,
          uploaded_by: req.user.id,
        }
      );
    }

    const students = await query(`SELECT id FROM users WHERE role = 'student'`);
    const msg = `New assignment: "${String(title).trim()}" — due ${normalizedDeadline}.`;
    await Promise.all(
      students.map((s) =>
        query(
          `INSERT INTO notifications (user_id, title, message) VALUES (:uid, :t, :m)`,
          {
            uid: s.id,
            t: 'New assignment',
            m: msg,
          }
        ).catch(() => {})
      )
    );

    const rows = await query(
      `SELECT a.*, c.name AS course_name, c.doctor_id AS course_doctor_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.id = :id LIMIT 1`,
      { id: aid }
    );
    return res.status(201).json({ assignment: rows[0] });
  } catch (err) {
    console.error('createAssignment error', err);
    return res.status(500).json({ error: 'Failed to create assignment' });
  }
}

async function updateAssignment(req, res) {
  try {
    const id = Number(req.params.id);
    const rows0 = await query(
      `SELECT a.*, c.doctor_id AS course_doctor_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.id = :id LIMIT 1`,
      { id }
    );
    if (!rows0.length) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const a0 = rows0[0];

    const access =
      req.user.role === 'admin'
        ? { ok: true }
        : await assertCourseAccessForDoctorOrAdmin(req.user, a0.course_id);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const { title, deadline, max_grade: maxGrade, description } = req.body;
    const updates = [];
    const params = { id };

    if (title !== undefined) {
      updates.push('title = :title');
      params.title = String(title).trim();
    }
    if (deadline !== undefined) {
      updates.push('deadline = :deadline');
      params.deadline = normalizeDatetimeInput(deadline);
    }
    if (maxGrade !== undefined) {
      const mg = Number(maxGrade);
      if (Number.isNaN(mg) || mg <= 0) {
        return res.status(400).json({ error: 'max_grade invalid' });
      }
      updates.push('max_grade = :max_grade');
      params.max_grade = mg;
    }
    if (description !== undefined) {
      updates.push('description = :description');
      params.description =
        description === null || description === '' ? null : String(description);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await query(`UPDATE assignments SET ${updates.join(', ')} WHERE id = :id`, params);
    const rows = await query(
      `SELECT a.*, c.name AS course_name, c.doctor_id AS course_doctor_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.id = :id LIMIT 1`,
      { id }
    );
    return res.json({ assignment: rows[0] });
  } catch (err) {
    console.error('updateAssignment error', err);
    return res.status(500).json({ error: 'Failed to update assignment' });
  }
}

async function deleteAssignment(req, res) {
  try {
    const id = Number(req.params.id);
    const rows0 = await query(
      `SELECT a.*, c.doctor_id AS course_doctor_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.id = :id LIMIT 1`,
      { id }
    );
    if (!rows0.length) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const a0 = rows0[0];
    const access =
      req.user.role === 'admin'
        ? { ok: true }
        : await assertCourseAccessForDoctorOrAdmin(req.user, a0.course_id);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    await query(`DELETE FROM assignments WHERE id = :id`, { id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteAssignment error', err);
    return res.status(500).json({ error: 'Failed to delete assignment' });
  }
}

module.exports = {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
};
