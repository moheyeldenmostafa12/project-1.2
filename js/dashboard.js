(function () {
  let doctorPanelCourseId = null;

  function showSection(id) {
    document.querySelectorAll('.view-section').forEach(function (el) {
      el.classList.toggle('active', el.id === id);
    });

    document.querySelectorAll('[data-target-view]').forEach(function (btn) {
      btn.classList.toggle(
        'active',
        btn.getAttribute('data-target-view') === id
      );
    });
    if (window.DH_NOTIFICATIONS && typeof window.DH_NOTIFICATIONS.reload === 'function') {
      if (id === 'view-notifications') {
        window.DH_NOTIFICATIONS.reload().catch(function () {});
      }
    }
    if (
      window.DH_APP &&
      typeof window.DH_APP.onSectionShown === 'function'
    ) {
      window.DH_APP.onSectionShown(id);
    }
  }

  function bindNavButtons() {
    document.querySelectorAll('[data-target-view]').forEach(function (btn) {
      btn.onclick = function () {
        showSection(btn.getAttribute('data-target-view'));
      };
    });
  }

  function deadlineClass(dateStr, now) {
    const d = new Date(dateStr);
    if (!(d instanceof Date) || Number.isNaN(+d)) {
      return '';
    }

    const diffMs = +d - +now;

    const dayMs = 86400000;
    if (diffMs < 0) {
      return 'tag-deadline-overdue';
    }
    if (diffMs < dayMs * 3) {
      return 'tag-deadline-soon';
    }

    return 'tag-deadline-ok';
  }

  function renderStudentAssignments(assignments, submissionsIndex) {
    const host = document.getElementById('student-assignments-body');
    const now = new Date();
    host.innerHTML = '';

    assignments.forEach(function (a) {
      const sid = submissionsIndex[String(a.id)];

      const tr = document.createElement('tr');
      const clazz = deadlineClass(a.deadline, now);

      let statusText = '';
      let gradeHtml = '';
      let statusCls = '';

      if (sid) {
        gradeHtml =
          sid.grade !== null && sid.grade !== undefined
            ? String(sid.grade) + '/' + String(a.max_grade)
            : '—';
        if (sid.status === 'graded') {
          statusText = 'Graded';
          statusCls = 'status-graded';
        } else if (sid.status === 'late') {
          statusText = 'Late';
          statusCls = 'status-late';
        } else {
          statusText = 'Submitted';
          statusCls = 'status-pending';
        }
      } else {
        gradeHtml = '—';
        statusText = 'Not submitted';
        statusCls = 'status-pending';
      }

      tr.innerHTML =
        '<td>' +
        escapeHtml(a.course_name || '') +
        '</td><td>' +
        escapeHtml(a.title) +
        '</td><td><span class="' +
        clazz +
        '">' +
        escapeHtml(a.deadline) +
        '</span></td><td style="max-width:140px;word-break:break-all;">' +
        (sid && sid.file_url
          ? '<a class="file-link" target="_blank" href="' +
            escapeAttr(sid.file_url) +
            '">file</a>'
          : '—') +
        '</td><td>' +
        gradeHtml +
        '</td><td><span class="status-pill ' +
        statusCls +
        '">' +
        statusText +
        '</span></td>';

      host.appendChild(tr);
    });
  }

  function renderStudentStats(courses, assignments) {
    const host = document.getElementById('student-stats-row');
    if (!host) return;
    const now = new Date();
    const dueSoon = (assignments || []).filter(function (a) {
      const d = new Date(a.deadline);
      if (Number.isNaN(+d)) return false;
      const diff = +d - +now;
      return diff >= 0 && diff < 86400000 * 3;
    }).length;
    const overdue = (assignments || []).filter(function (a) {
      const d = new Date(a.deadline);
      if (Number.isNaN(+d)) return false;
      return +d - +now < 0;
    }).length;

    host.innerHTML =
      '<div class="stat-chip">' +
      '<div class="stat-chip-icon blue" aria-hidden="true">▣</div>' +
      '<div><div class="stat-chip-label">Courses</div><div class="stat-chip-value">' +
      String((courses || []).length) +
      '</div></div></div>' +
      '<div class="stat-chip">' +
      '<div class="stat-chip-icon amber" aria-hidden="true">⏱</div>' +
      '<div><div class="stat-chip-label">Due in 3 days</div><div class="stat-chip-value">' +
      String(dueSoon) +
      '</div></div></div>' +
      '<div class="stat-chip">' +
      '<div class="stat-chip-icon green" aria-hidden="true">✓</div>' +
      '<div><div class="stat-chip-label">Total assignments</div><div class="stat-chip-value">' +
      String((assignments || []).length) +
      '</div></div></div>' +
      '<div class="stat-chip">' +
      '<div class="stat-chip-icon blue" aria-hidden="true">!</div>' +
      '<div><div class="stat-chip-label">Overdue</div><div class="stat-chip-value">' +
      String(overdue) +
      '</div></div></div>';
  }

  function renderStudentCourseCards(courses) {
    const host = document.getElementById('student-course-cards');
    if (!host) return;
    host.innerHTML = '';
    (courses || []).forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'course-card';
      const year =
        c.academic_year != null && c.academic_year !== ''
          ? 'Year ' + String(c.academic_year)
          : 'Open for all years';
      const dept = c.department ? String(c.department) : '—';
      btn.innerHTML =
        '<div class="course-card-name">' +
        escapeHtml(c.name || '') +
        '</div>' +
        '<div class="course-card-meta">' +
        escapeHtml(c.doctor_name ? 'Doctor: ' + c.doctor_name : '') +
        '</div>' +
        '<div class="course-card-badges">' +
        '<span class="badge-soft">' +
        escapeHtml(year) +
        '</span>' +
        '<span class="badge-soft">' +
        escapeHtml(dept) +
        '</span>' +
        '</div>';
      btn.onclick = function () {
        openStudentCourse(c).catch(function (err) {
          window.DH_AUTH.showToast(err.message, true);
        });
      };
      host.appendChild(btn);
    });
  }

  function renderMaterialTiles(container, materials, options) {
    options = options || {};
    const host = container;
    if (!host) return;
    host.innerHTML = '';
    if (!(materials || []).length) {
      const empty = document.createElement('div');
      empty.className = 'hint-muted';
      empty.style.padding = '0.5rem 0';
      empty.textContent = options.emptyText || 'No materials yet.';
      host.appendChild(empty);
      return;
    }
    (materials || []).forEach(function (m) {
      const row = document.createElement('div');
      row.className = 'material-tile';
      const left = document.createElement('div');
      const t = document.createElement('div');
      t.className = 'material-tile-title';
      t.textContent = m.title || '';
      const sub = document.createElement('div');
      sub.className = 'material-tile-sub';
      sub.textContent = (m.uploader_name ? 'By ' + m.uploader_name : '') + (m.created_at ? ' · ' + m.created_at : '');
      left.appendChild(t);
      left.appendChild(sub);
      const actions = document.createElement('div');
      actions.className = 'material-tile-actions';
      const a = document.createElement('a');
      a.className = 'btn btn-primary btn-mini';
      a.href = m.file_url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Download';
      actions.appendChild(a);
      if (options.onDelete && m.id) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-danger btn-mini';
        del.textContent = 'Delete';
        del.onclick = function () {
          options.onDelete(m);
        };
        actions.appendChild(del);
      }
      row.appendChild(left);
      row.appendChild(actions);
      host.appendChild(row);
    });
  }

  async function openStudentCourse(course) {
    const overview = document.getElementById('student-dash-overview');
    const view = document.getElementById('student-course-material-view');
    if (!overview || !view) return;

    document.getElementById('student-course-view-title').textContent = course.name || '';
    const sub = document.getElementById('student-course-view-sub');
    const parts = [];
    if (course.doctor_name) parts.push('Course doctor: ' + course.doctor_name);
    if (course.description) parts.push(course.description);
    sub.textContent = parts.join(' · ');

    overview.classList.add('hidden');
    view.classList.remove('hidden');

    const list = document.getElementById('student-course-materials-list');
    list.innerHTML = '<div class="hint-muted">Loading...</div>';

    const data = await window.DH_AUTH.apiJson('/api/materials?course_id=' + encodeURIComponent(String(course.id)));
    renderMaterialTiles(list, data.materials || [], { emptyText: 'No materials for this course yet.' });
  }

  function closeStudentCourseView() {
    const overview = document.getElementById('student-dash-overview');
    const view = document.getElementById('student-course-material-view');
    if (overview) overview.classList.remove('hidden');
    if (view) view.classList.add('hidden');
  }

  function renderDoctorCourseCards(courses) {
    const host = document.getElementById('doctor-course-cards');
    if (!host) return;
    host.innerHTML = '';
    (courses || []).forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'course-card';
      const year =
        c.academic_year != null && c.academic_year !== ''
          ? 'Year ' + String(c.academic_year)
          : 'All years';
      btn.innerHTML =
        '<div class="course-card-name">' +
        escapeHtml(c.name || '') +
        '</div>' +
        '<div class="course-card-meta">Click to open course files</div>' +
        '<div class="course-card-badges">' +
        '<span class="badge-soft">' +
        escapeHtml(year) +
        '</span>' +
        (c.department
          ? '<span class="badge-soft">' + escapeHtml(String(c.department)) + '</span>'
          : '') +
        '</div>';
      btn.onclick = function () {
        openDoctorCoursePanel(c).catch(function (err) {
          window.DH_AUTH.showToast(err.message, true);
        });
      };
      host.appendChild(btn);
    });
  }

  async function refreshDoctorCoursePanelData(courseId) {
    const id = Number(courseId);
    if (!id) return;
    const matRes = await window.DH_AUTH.apiJson('/api/materials?course_id=' + encodeURIComponent(String(id)));

    const matList = document.getElementById('doctor-panel-materials-list');
    renderMaterialTiles(matList, matRes.materials || [], {
      emptyText: 'No files uploaded for this course yet.',
      onDelete: function (m) {
        if (!confirm('Delete this file?')) return;
        window.DH_AUTH
          .apiJson('/api/materials/' + m.id, { method: 'DELETE' })
          .then(async function () {
            window.DH_AUTH.showToast('Deleted');
            await refreshDoctorMaterials();
            await refreshDoctorCoursePanelData(id);
          })
          .catch(function (err) {
            window.DH_AUTH.showToast(err.message, true);
          });
      },
    });
  }

  async function openDoctorCoursePanel(course) {
    doctorPanelCourseId = Number(course.id);
    const panel = document.getElementById('doctor-course-panel');
    const hub = document.getElementById('doctor-course-cards');
    if (panel) panel.classList.remove('hidden');
    if (hub) hub.classList.add('hidden');

    document.getElementById('doctor-course-panel-title').textContent = course.name || '';
    const sub = document.getElementById('doctor-course-panel-sub');
    const bits = [];
    if (course.academic_year != null && course.academic_year !== '') bits.push('Year ' + String(course.academic_year));
    if (course.department) bits.push(String(course.department));
    sub.textContent = bits.join(' · ') || 'Course files';

    const selA = document.getElementById('doctor-assignment-course');
    const selM = document.getElementById('doctor-material-course');
    if (selA) selA.value = String(course.id);
    if (selM) selM.value = String(course.id);

    await refreshDoctorCoursePanelData(course.id);
  }

  function closeDoctorCoursePanel() {
    doctorPanelCourseId = null;
    const panel = document.getElementById('doctor-course-panel');
    const hub = document.getElementById('doctor-course-cards');
    if (panel) panel.classList.add('hidden');
    if (hub) hub.classList.remove('hidden');
  }

  function fillSelect(select, items, valueKey, labelFn) {
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '—';
    select.appendChild(opt0);

    items.forEach(function (it) {
      const opt = document.createElement('option');
      opt.value = String(it[valueKey]);
      opt.textContent = labelFn(it);
      select.appendChild(opt);
    });
  }

  function renderDoctorAssignmentsTable(assignments) {
    const host = document.getElementById('doctor-assignments-manage-body');
    if (!host) return;
    host.innerHTML = '';
    assignments.forEach(function (a) {
      const tr = document.createElement('tr');
      tr.dataset.id = String(a.id);
      tr.dataset.course_id = String(a.course_id);

      const now = Date.now();
      const clazz = deadlineClass(a.deadline, new Date(now));

      tr.innerHTML =
        '<td>' +
        escapeHtml(a.course_name || '') +
        '</td><td>' +
        escapeHtml(a.title) +
        '</td><td><span class="' +
        clazz +
        '">' +
        escapeHtml(a.deadline) +
        '</span></td><td>' +
        escapeHtml(String(a.max_grade || '')) +
        '</td><td><button class="btn btn-ghost btn-mini" data-remove-ass="' +
        escapeAttr(String(a.id)) +
        '">Delete</button></td>';

      host.appendChild(tr);
    });

    host.querySelectorAll('[data-remove-ass]').forEach(function (btn) {
      btn.onclick = async function () {
        const aid = btn.getAttribute('data-remove-ass');
        if (!confirm('Delete assignment ' + aid + '?')) return;
        try {
          await window.DH_AUTH.apiJson('/api/assignments/' + aid, {
            method: 'DELETE',
          });
          window.DH_AUTH.showToast('Removed');
          await refreshDoctorAssignments();
          await refreshGradingRows();
          await reloadStudentPanelsIfVisible();
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });
  }

  async function reloadStudentPanelsIfVisible() {
    await refreshStudent();
  }

  function renderDoctorSubmissions(rows) {
    const host = document.getElementById('doctor-grade-body');
    host.innerHTML = '';
    rows.forEach(function (s) {
      const tr = document.createElement('tr');
      const hasGrade =
        s.grade !== null && s.grade !== undefined && s.status === 'graded';
      const now = deadlineClass(s.deadline, new Date());

      const labelStatus = escapeHtml(String(s.status || ''));

      tr.innerHTML =
        '<td>' +
        escapeHtml(s.student_name || '') +
        '</td><td>' +
        escapeHtml(s.assignment_title || '') +
        '</td><td><span class="' +
        now +
        '">' +
        escapeHtml(String(s.deadline || '')) +
        '</span></td><td><a class="file-link" href="' +
        escapeAttr(String(s.file_url || '')) +
        '" target="_blank">file</a></td><td>' +
        labelStatus +
        '</td><td style="white-space:nowrap;">' +
        '<input style="width:92px;display:inline-block" type="number" step="0.01" data-grade-input="' +
        escapeAttr(String(s.id)) +
        '" value="' +
        (hasGrade ? escapeAttr(String(s.grade || '')) : '') +
        '"/>' +
        '<button style="margin-inline-start:8px;" class="btn btn-primary btn-mini" data-save-grade="' +
        escapeAttr(String(s.id)) +
        '" data-max="' +
        escapeAttr(String(s.max_grade || '')) +
        '" data-aid="' +
        escapeAttr(String(s.assignment_id || '')) +
        '">Save</button></td>';

      host.appendChild(tr);
    });

    host.querySelectorAll('[data-save-grade]').forEach(function (btn) {
      btn.onclick = async function () {
        const sid = btn.getAttribute('data-save-grade');
        const max = Number(btn.getAttribute('data-max'));
        const input = host.querySelector('[data-grade-input="' + sid + '"]');
        const val = Number(input.value);
        if (Number.isNaN(val)) {
          window.DH_AUTH.showToast('Invalid grade', true);
          return;
        }
        if (val < 0 || val > max) {
          window.DH_AUTH.showToast('Grade must be 0..' + max, true);
          return;
        }
        try {
          await window.DH_AUTH.apiJson('/api/submissions/' + sid + '/grade', {
            method: 'PATCH',
            body: JSON.stringify({ grade: val, feedback: '' }),
          });
          window.DH_AUTH.showToast('Saved');
          await refreshGradingRows();
          if (window.DH_NOTIFICATIONS) {
            window.DH_NOTIFICATIONS.reload().catch(function () {});
          }
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });
  }

  function renderAdminUsers(users) {
    const host = document.getElementById('admin-users-body');
    host.innerHTML = '';
    users.forEach(function (u) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        u.id +
        '</td><td>' +
        escapeHtml(u.name || '') +
        '</td><td>' +
        escapeHtml(u.email || '') +
        '</td><td>' +
        escapeHtml(u.role || '') +
        '</td><td>' +
        escapeHtml(u.academic_year != null ? String(u.academic_year) : '—') +
        '</td><td>' +
        escapeHtml(u.department || '—') +
        '</td><td>' +
        '<button class="btn btn-sm btn-secondary edit-user-btn" data-user-id="' + u.id + '">Edit</button> ' +
        '<button class="btn btn-sm btn-danger delete-user-btn" data-user-id="' + u.id + '">Delete</button>' +
        '</td>';

      host.appendChild(tr);
    });
  }

  function renderAdminStats(data) {
    const host = document.getElementById('admin-stats-chart');
    host.innerHTML = '';

    const users = data.users || {};
    const totals = [
      { key: 'students', label: 'Students', val: Number(users.students || 0) },
      { key: 'doctors', label: 'Doctors', val: Number(users.doctors || 0) },
      { key: 'admins', label: 'Admins', val: Number(users.admins || 0) },
    ];

    const max =
      totals.reduce(function (m, x) {
        return Math.max(m, x.val);
      }, 0) || 1;

    totals.forEach(function (t) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const width = Math.round((t.val / max) * 100);
      row.innerHTML =
        '<span style="min-width:92px">' +
        escapeHtml(t.label) +
        '</span><div class="stat-bar"><span style="width:' +
        width +
        '%;"></span></div><span style="min-width:42px;text-align:end;">' +
        t.val +
        '</span>';
      host.appendChild(row);
    });

    const cards = [
      ['Courses', data.courses && data.courses.total_courses],
      ['Assignments', data.assignments && data.assignments.total_assignments],
      ['Submissions', data.submissions && data.submissions.total_submissions],
      ['Materials', data.materials && data.materials.total_materials],
      ['Graded', data.graded && data.graded.graded_submissions],
      ['Pending', data.pending && data.pending.pending_submissions],
    ];

    const meta = document.getElementById('admin-stats-meta');
    meta.innerHTML = '';
    cards.forEach(function (c) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '0.75rem';
      card.innerHTML =
        '<div class="hint-muted">' +
        escapeHtml(c[0]) +
        '</div><div style="font-size:1.6rem;font-weight:800;">' +
        escapeHtml(String(c[1] != null ? c[1] : '0')) +
        '</div>';
      meta.appendChild(card);
    });

    const recent = document.getElementById('admin-recent-submissions');
    recent.innerHTML = '';
    (data.recentSubmissions || []).forEach(function (r) {
      const row = document.createElement('div');
      row.className = 'notif-item';
      row.innerHTML =
        '<div><strong>' +
        escapeHtml(r.student_name || '') +
        '</strong> — ' +
        escapeHtml(r.assignment_title || '') +
        '</div><small>' +
        escapeHtml(String(r.submitted_at || '')) +
        ' · ' +
        escapeHtml(String(r.status || '')) +
        '</small>';
      recent.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function refreshStudent() {
    closeStudentCourseView();
    try {
      const courses = await window.DH_AUTH.apiJson('/api/courses');
      const list = courses.courses || [];
      renderStudentCourseCards(list);

      const assignments = await window.DH_AUTH.apiJson('/api/assignments');
      const subs = await window.DH_AUTH.apiJson('/api/submissions');

      const idx = {};
      (subs.submissions || []).forEach(function (s) {
        idx[String(s.assignment_id)] = s;
      });

      const assList = assignments.assignments || [];
      renderStudentAssignments(assList, idx);
      renderStudentStats(list, assList);

      const groupedByCourse = {};
      assList.forEach(function (a) {
        const cid = String(a.course_id || '');
        if (!cid) return;
        if (!groupedByCourse[cid]) groupedByCourse[cid] = [];
        groupedByCourse[cid].push(a);
      });

      const submitCourseOptions = (list || []).filter(function (c) {
        return groupedByCourse[String(c.id)] && groupedByCourse[String(c.id)].length > 0;
      });
      const submitCourseSelect = document.getElementById('student-course-submit-select');
      fillSelect(submitCourseSelect, submitCourseOptions, 'id', function (c) {
        const items = groupedByCourse[String(c.id)] || [];
        return c.name + ' (' + String(items.length) + ' assignments)';
      });

      if (!window.DH_APP_STATE) {
        window.DH_APP_STATE = {};
      }
      window.DH_APP_STATE.studentCourseAssignments = groupedByCourse;
    } catch (err) {
      window.DH_AUTH.showToast(err.message, true);
    }
  }

  async function refreshDoctorCourses() {
    const data = await window.DH_AUTH.apiJson('/api/courses');
    const courses = data.courses || [];
    renderDoctorCourseCards(courses);
    const selA = document.getElementById('doctor-assignment-course');
    const selM = document.getElementById('doctor-material-course');
    fillSelect(selA, courses, 'id', function (c) {
      return c.name;
    });
    fillSelect(selM, courses, 'id', function (c) {
      return c.name;
    });
    if (doctorPanelCourseId) {
      const still = courses.some(function (c) {
        return Number(c.id) === Number(doctorPanelCourseId);
      });
      if (still) {
        if (selA) selA.value = String(doctorPanelCourseId);
        if (selM) selM.value = String(doctorPanelCourseId);
        await refreshDoctorCoursePanelData(doctorPanelCourseId).catch(function () {});
      } else {
        closeDoctorCoursePanel();
      }
    }
    return courses;
  }

  async function refreshDoctorAssignments() {
    const host = document.getElementById('doctor-assignments-manage-body');
    if (!host) return;
    const data = await window.DH_AUTH.apiJson('/api/assignments');
    renderDoctorAssignmentsTable(data.assignments || []);
  }

  async function refreshGradingRows() {
    const data = await window.DH_AUTH.apiJson('/api/submissions');
    renderDoctorSubmissions(data.submissions || []);
  }

  async function refreshDoctorMaterials() {
    const data = await window.DH_AUTH.apiJson('/api/materials');
    const host = document.getElementById('doctor-materials-body');
    host.innerHTML = '';
    (data.materials || []).forEach(function (m) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        escapeHtml(m.course_name || '') +
        '</td><td>' +
        escapeHtml(m.title) +
        '</td><td><a class="file-link" target="_blank" href="' +
        escapeAttr(m.file_url) +
        '">file</a></td><td><button class="btn btn-danger btn-mini" data-del-mat="' +
        escapeAttr(String(m.id)) +
        '">Delete</button></td>';
      host.appendChild(tr);
    });

    host.querySelectorAll('[data-del-mat]').forEach(function (btn) {
      btn.onclick = async function () {
        const id = btn.getAttribute('data-del-mat');
        if (!confirm('Delete material ' + id + '?')) return;
        try {
          await window.DH_AUTH.apiJson('/api/materials/' + id, {
            method: 'DELETE',
          });
          window.DH_AUTH.showToast('Removed');
          await refreshDoctorMaterials();
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });

    if (doctorPanelCourseId) {
      refreshDoctorCoursePanelData(doctorPanelCourseId).catch(function () {});
    }
  }

  async function refreshAdminUsers() {
    const data = await window.DH_AUTH.apiJson('/api/admin/users');
    renderAdminUsers(data.users || []);
  }

  function renderAdminCourses(courses) {
    const host = document.getElementById('admin-courses-body');
    if (!host) return;
    host.innerHTML = '';
    (courses || []).forEach(function (c) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        escapeHtml(String(c.id)) +
        '</td><td>' +
        escapeHtml(c.name || '') +
        '</td><td>' +
        escapeHtml(c.doctor_name || '') +
        '</td><td>' +
        escapeHtml(c.academic_year != null ? String(c.academic_year) : '—') +
        '</td><td>' +
        escapeHtml(c.department || '—') +
        '</td><td style="white-space:nowrap;">' +
        '<button class="btn btn-ghost btn-mini" data-admin-edit-course="' +
        escapeAttr(String(c.id)) +
        '">Edit</button>' +
        '<button class="btn btn-ghost btn-mini" style="margin-inline-start:8px;" data-admin-del-ass-course="' +
        escapeAttr(String(c.id)) +
        '">Delete assignment</button>' +
        '<button class="btn btn-ghost btn-mini" style="margin-inline-start:8px;" data-admin-del-mat-course="' +
        escapeAttr(String(c.id)) +
        '">Delete material</button>' +
        '<button class="btn btn-danger btn-mini" style="margin-inline-start:8px;" data-admin-del-course="' +
        escapeAttr(String(c.id)) +
        '">Delete course</button>' +
        '</td>';
      host.appendChild(tr);
    });

    host.querySelectorAll('[data-admin-edit-course]').forEach(function (btn) {
      btn.onclick = async function () {
        const id = Number(btn.getAttribute('data-admin-edit-course'));
        const row = (courses || []).find(function (c) {
          return Number(c.id) === id;
        });
        if (!row) return;
        const name = prompt('Course name:', row.name || '');
        if (name === null || !String(name).trim()) return;
        const year = prompt('Academic year (blank for none):', row.academic_year != null ? String(row.academic_year) : '');
        const department = prompt('Department (blank for none):', row.department || '');
        const description = prompt('Description:', row.description || '');
        try {
          await window.DH_AUTH.apiJson('/api/courses/' + id, {
            method: 'PATCH',
            body: JSON.stringify({
              name: String(name).trim(),
              academic_year: year === '' ? null : Number(year),
              department: department === '' ? null : department,
              description: description === '' ? null : description,
            }),
          });
          window.DH_AUTH.showToast('Course updated');
          await refreshAdminCourses();
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });

    host.querySelectorAll('[data-admin-del-ass-course]').forEach(function (btn) {
      btn.onclick = async function () {
        const courseId = Number(btn.getAttribute('data-admin-del-ass-course'));
        try {
          const data = await window.DH_AUTH.apiJson('/api/assignments?course_id=' + encodeURIComponent(String(courseId)));
          const assignments = data.assignments || [];
          if (!assignments.length) {
            window.DH_AUTH.showToast('No assignments in this course.');
            return;
          }
          const picked = prompt(
            'Enter assignment ID to delete:\n' +
              assignments.map(function (a) { return a.id + ': ' + a.title; }).join('\n'),
            String(assignments[0].id)
          );
          if (!picked) return;
          await window.DH_AUTH.apiJson('/api/assignments/' + Number(picked), { method: 'DELETE' });
          window.DH_AUTH.showToast('Assignment deleted');
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });

    host.querySelectorAll('[data-admin-del-mat-course]').forEach(function (btn) {
      btn.onclick = async function () {
        const courseId = Number(btn.getAttribute('data-admin-del-mat-course'));
        try {
          const data = await window.DH_AUTH.apiJson('/api/materials?course_id=' + encodeURIComponent(String(courseId)));
          const materials = data.materials || [];
          if (!materials.length) {
            window.DH_AUTH.showToast('No materials in this course.');
            return;
          }
          const picked = prompt(
            'Enter material ID to delete:\n' +
              materials.map(function (m) { return m.id + ': ' + m.title; }).join('\n'),
            String(materials[0].id)
          );
          if (!picked) return;
          await window.DH_AUTH.apiJson('/api/materials/' + Number(picked), { method: 'DELETE' });
          window.DH_AUTH.showToast('Material deleted');
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });

    host.querySelectorAll('[data-admin-del-course]').forEach(function (btn) {
      btn.onclick = async function () {
        const courseId = Number(btn.getAttribute('data-admin-del-course'));
        if (!confirm('Delete this course? This also removes its assignments and materials.')) return;
        try {
          await window.DH_AUTH.apiJson('/api/courses/' + courseId, { method: 'DELETE' });
          window.DH_AUTH.showToast('Course deleted');
          await refreshAdminCourses();
          await refreshAdminStats();
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      };
    });
  }

  async function refreshAdminCourses() {
    const data = await window.DH_AUTH.apiJson('/api/courses');
    renderAdminCourses(data.courses || []);
  }

  async function refreshAdminStats() {
    const data = await window.DH_AUTH.apiJson('/api/admin/stats');
    renderAdminStats(data);
  }

  async function refreshAdminSubmissions() {
    const data = await window.DH_AUTH.apiJson('/api/submissions');
    const host = document.getElementById('admin-submissions-body');
    if (!host) return;
    host.innerHTML = '';
    (data.submissions || []).forEach(function (s) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        escapeHtml(s.student_name || '') +
        '</td><td>' +
        escapeHtml(s.course_name || '') +
        '</td><td>' +
        escapeHtml(s.assignment_title || '') +
        '</td><td>' +
        escapeHtml(String(s.submitted_at || '')) +
        '</td><td>' +
        (s.file_url
          ? '<a class="file-link" href="' + escapeAttr(String(s.file_url)) + '" target="_blank">file</a>'
          : '—') +
        '</td><td>' +
        escapeHtml(String(s.status || '')) +
        '</td><td>' +
        escapeHtml(s.grade != null ? String(s.grade) : '—') +
        '</td>';
      host.appendChild(tr);
    });
  }

  function syncDashboardNavTarget() {
    const btn = document.getElementById('nav-btn-dashboard');
    if (!btn) return;
    const u = window.DH_APP_STATE.user;
    let target = 'view-dashboard';
    if (u && u.role === 'student') {
      target = 'view-dashboard-student';
    } else if (u && u.role === 'doctor') {
      target = 'view-dashboard-doctor';
    }
    btn.setAttribute('data-target-view', target);
  }

  function applyRoleChrome() {
    const u = window.DH_APP_STATE.user;
    document.getElementById('student-nav-block').hidden = !(u && u.role === 'student');
    document.getElementById('doctor-nav-block').hidden = !(u && u.role === 'doctor');
    document.getElementById('admin-nav-block').hidden = !(u && u.role === 'admin');

    document.getElementById('hub-student').hidden = !(u && u.role === 'student');
    document.getElementById('hub-doctor').hidden = !(u && u.role === 'doctor');
    document.getElementById('hub-admin').hidden = !(u && u.role === 'admin');

    syncDashboardNavTarget();

    const roleLabel = document.getElementById('user-role-label');
    if (roleLabel) {
      roleLabel.textContent = u ? u.role : '';
    }
    const nameLabel = document.getElementById('user-name-label');
    if (nameLabel) {
      nameLabel.textContent = u ? u.name : '';
    }
    const sub = document.getElementById('app-header-subline');
    if (sub && window.DH_AUTH) {
      if (!u) {
        sub.textContent = '';
      } else {
        const lang = window.DH_AUTH.getLang();
        const hello = 'Welcome, ';
        const fac = window.DH_AUTH.t('faculty');
        const uni = window.DH_AUTH.t('uni');
        sub.textContent = u.name ? hello + u.name + ' · ' + fac + ' — ' + uni : fac + ' — ' + uni;
      }
    }

    const av = document.getElementById('header-user-avatar');
    const em = document.getElementById('header-user-email');
    if (em) {
      em.textContent = u && u.email ? u.email : '';
    }
    if (av && u && u.name) {
      const parts = String(u.name).trim().split(/\s+/).filter(Boolean);
      let ini = '';
      if (parts.length >= 2) {
        ini = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      } else if (parts.length === 1) {
        ini = parts[0].slice(0, 2).toUpperCase();
      }
      av.textContent = ini || '?';
    } else if (av) {
      av.textContent = '?';
    }
  }

  async function onLoginSuccess() {
    applyRoleChrome();
    window.DH_AUTH.applyTranslations();

    const u = window.DH_APP_STATE.user;
    if (!u) {
      return;
    }

    let defaultView = 'view-dashboard';

    if (window.DH_NOTIFICATIONS) {
      window.DH_NOTIFICATIONS.startPolling();
    }

    if (u.role === 'student') {
      await refreshStudent();
      defaultView = 'view-dashboard-student';
    } else if (u.role === 'doctor') {
      await refreshDoctorCourses();
      await refreshDoctorAssignments();
      await refreshGradingRows();
      await refreshDoctorMaterials();
      defaultView = 'view-dashboard-doctor';
    } else if (u.role === 'admin') {
      await refreshAdminUsers();
      await refreshAdminCourses();
      await refreshAdminSubmissions();
      await refreshAdminStats();
      defaultView = 'view-admin-analytics';
    }

    showSection(defaultView);

    await fillProfileForm();
  }

  async function fillProfileForm() {
    const u = window.DH_APP_STATE.user;
    if (!u) return;
    try {
      const data = await window.DH_AUTH.apiJson('/api/auth/me');
      const user = data.user;
      document.getElementById('profile-name').value = user.name || '';
      document.getElementById('profile-email').value = user.email || '';
      document.getElementById('profile-year').value =
        user.academic_year != null ? String(user.academic_year) : '';
      document.getElementById('profile-dept').value = user.department || '';
      document.getElementById('profile-role').textContent = user.role || '';
      document.getElementById('profile-current-pass').value = '';
      document.getElementById('profile-new-pass').value = '';
    } catch (err) {
      window.DH_AUTH.showToast(err.message, true);
    }
  }

  async function saveProfile(evt) {
    evt.preventDefault();
    const payload = {
      name: document.getElementById('profile-name').value,
      academic_year:
        document.getElementById('profile-year').value === ''
          ? null
          : Number(document.getElementById('profile-year').value),
      department:
        document.getElementById('profile-dept').value === ''
          ? null
          : document.getElementById('profile-dept').value,
    };

    const cur = document.getElementById('profile-current-pass').value;
    const neu = document.getElementById('profile-new-pass').value;
    if (neu) {
      payload.current_password = cur;
      payload.password = neu;
    }

    try {
      const data = await window.DH_AUTH.apiJson('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      window.DH_APP_STATE.user = data.user;
      applyRoleChrome();
      window.DH_AUTH.showToast('Saved');
      if (window.DH_NOTIFICATIONS) {
        window.DH_NOTIFICATIONS.reload().catch(function () {});
      }
    } catch (err) {
      window.DH_AUTH.showToast(err.message, true);
    }
  }

  function bindDoctorCreateAssignment() {
    const form = document.getElementById('doctor-assignment-form');
    if (!form || form._bound) return;
    form._bound = true;
    form.onsubmit = async function (evt) {
      evt.preventDefault();
      try {
        const fileInput = form.querySelector('#assignment-file');
        const hasFile = !!(fileInput && fileInput.files && fileInput.files.length > 0);
        if (hasFile) {
          const fd = new FormData(form);
          const token = window.DH_AUTH.getToken();
          const res = await fetch('https://project-12-production.up.railway.app/api/assignments', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: fd,
          });
          const text = await res.text();
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (_) {
            data = {};
          }
          if (!res.ok) {
            throw new Error(data.error || 'Failed to create assignment');
          }
        } else {
          const raw = Object.fromEntries(new FormData(form).entries());
          await window.DH_AUTH.apiJson('/api/assignments', {
            method: 'POST',
            body: JSON.stringify({
              course_id: Number(raw.course_id),
              title: raw.title,
              deadline: raw.deadline,
              description: raw.description || '',
            }),
          });
        }
        window.DH_AUTH.showToast('Assignment created');
        form.reset();
        await refreshDoctorAssignments();
        await refreshStudent();
        await refreshGradingRows();
      } catch (err) {
        window.DH_AUTH.showToast(err.message, true);
      }
    };
  }

  function bindAdminCreateUser() {
    const form = document.getElementById('admin-user-create-form');
    if (!form || form._bound) return;
    form._bound = true;
    form.onsubmit = async function (evt) {
      evt.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const body = {
        name: fd.name,
        email: fd.email,
        password: fd.password,
        role: fd.role,
        academic_year: fd.academic_year === '' ? null : Number(fd.academic_year),
        department: fd.department === '' ? null : fd.department,
      };
      try {
        await window.DH_AUTH.apiJson('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        window.DH_AUTH.showToast('User created');
        form.reset();
        await refreshAdminUsers();
        await refreshAdminStats();
      } catch (err) {
        window.DH_AUTH.showToast(err.message, true);
      }
    };
  }

  async function bindAdminCreateCourse() {
    const form = document.getElementById('admin-course-form');
    const doctorSelect = document.getElementById('admin-course-doctor');
    if (!form || !doctorSelect || form._bound) return;
    form._bound = true;

    const usersData = await window.DH_AUTH.apiJson('/api/admin/users');
    const doctors = (usersData.users || []).filter(function (u) {
      return u.role === 'doctor';
    });
    fillSelect(doctorSelect, doctors, 'id', function (d) {
      return d.name + ' (' + d.email + ')';
    });

    form.onsubmit = async function (evt) {
      evt.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const body = {
        name: fd.name,
        doctor_id: Number(fd.doctor_id),
        description: fd.description || '',
        academic_year: fd.academic_year === '' ? null : Number(fd.academic_year),
        department: fd.department === '' ? null : fd.department,
      };
      try {
        await window.DH_AUTH.apiJson('/api/courses', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        window.DH_AUTH.showToast('Course created');
        form.reset();
        fillSelect(doctorSelect, doctors, 'id', function (d) {
          return d.name + ' (' + d.email + ')';
        });
        await refreshAdminCourses();
        await refreshAdminStats();
      } catch (err) {
        window.DH_AUTH.showToast(err.message, true);
      }
    };
  }

  function bindAdminUserActions() {
    if (document._adminUserActionsBound) return;
    document._adminUserActionsBound = true;
    document.addEventListener('click', async function (evt) {
      const btn = evt.target;
      if (!btn.matches('.edit-user-btn, .delete-user-btn')) return;
      const userId = Number(btn.dataset.userId);
      if (!userId) return;

      if (btn.classList.contains('edit-user-btn')) {
        // Edit user
        const newName = prompt('Enter new name:');
        if (!newName) return;
        const newEmail = prompt('Enter new email:');
        if (!newEmail) return;
        const newRole = prompt('Enter new role (student/doctor/admin):');
        if (!newRole || !['student', 'doctor', 'admin'].includes(newRole.toLowerCase())) return;
        try {
          await window.DH_AUTH.apiJson('/api/admin/users/' + userId, {
            method: 'PATCH',
            body: JSON.stringify({
              name: newName.trim(),
              email: newEmail.trim(),
              role: newRole.toLowerCase(),
            }),
          });
          window.DH_AUTH.showToast('User updated');
          await refreshAdminUsers();
          await refreshAdminStats();
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      } else if (btn.classList.contains('delete-user-btn')) {
        // Delete user
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
          await window.DH_AUTH.apiJson('/api/admin/users/' + userId, {
            method: 'DELETE',
          });
          window.DH_AUTH.showToast('User deleted');
          await refreshAdminUsers();
          await refreshAdminStats();
        } catch (err) {
          window.DH_AUTH.showToast(err.message, true);
        }
      }
    });
  }

  async function exportCsv() {
    try {
      const token = window.DH_AUTH.getToken();
      const res = await fetch('https://project-12-production.up.railway.app/api/admin/export/submissions', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'submissions_export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.DH_AUTH.showToast(err.message, true);
    }
  }

  function onSectionShown(id) {
    if (id === 'view-profile') {
      fillProfileForm().catch(function () {});
    }
    if (
      window.DH_APP_STATE.user &&
      window.DH_APP_STATE.user.role === 'admin' &&
      id === 'view-admin-analytics'
    ) {
      refreshAdminStats().catch(function () {});
    }
    if (
      window.DH_APP_STATE.user &&
      window.DH_APP_STATE.user.role === 'admin' &&
      id === 'view-admin-console'
    ) {
      refreshAdminUsers().catch(function () {});
      refreshAdminCourses().catch(function () {});
      refreshAdminSubmissions().catch(function () {});
      bindAdminCreateUser();
      bindAdminCreateCourse().catch(function (err) {
        window.DH_AUTH.showToast(err.message, true);
      });
      bindAdminUserActions();
      document.getElementById('admin-export-btn').onclick = exportCsv;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindNavButtons();
    var btnStBack = document.getElementById('btn-student-course-back');
    if (btnStBack) {
      btnStBack.onclick = function () {
        closeStudentCourseView();
      };
    }
    var btnDocClose = document.getElementById('btn-doctor-course-close');
    if (btnDocClose) {
      btnDocClose.onclick = function () {
        closeDoctorCoursePanel();
      };
    }
    document.getElementById('profile-form').onsubmit = saveProfile;
    bindDoctorCreateAssignment();

    if (window.DH_UPLOAD_BIND) {
      window.DH_UPLOAD_BIND();
    }

    window.DH_APP = {
      onLoginSuccess: onLoginSuccess,
      refreshStudent: refreshStudent,
      refreshDoctorMaterials: refreshDoctorMaterials,
      onSectionShown: onSectionShown,
      showSection: showSection,
    };

    var headerNotif = document.getElementById('header-notif-btn');
    if (headerNotif) {
      headerNotif.onclick = function () {
        showSection('view-notifications');
      };
    }
    var headerProf = document.getElementById('header-profile-chip');
    if (headerProf) {
      headerProf.onclick = function () {
        showSection('view-profile');
      };
    }
  });
})();
