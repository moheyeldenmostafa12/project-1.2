(function () {
  function bindSubmissionUpload(formId) {
    const form = document.getElementById(formId);
    if (!form || form._dhBound) {
      return;
    }
    form._dhBound = true;
    form.onsubmit = async function (evt) {
      evt.preventDefault();
      const fd = new FormData(form);
      const courseId = String(fd.get('course_id') || '');
      const appState = window.DH_APP_STATE || {};
      const groupedByCourse = appState.studentCourseAssignments || {};
      const courseAssignments = groupedByCourse[courseId] || [];
      const assignmentId = courseAssignments.length ? String(courseAssignments[0].id) : '';
      const fileInput = form.querySelector('input[type=file]');

      if (!assignmentId || !fileInput.files || fileInput.files.length === 0) {
        window.DH_AUTH.showToast('Choose a course with an assignment and upload a file.', true);
        return;
      }
      fd.set('assignment_id', assignmentId);
      fd.delete('course_id');

      try {
        const token = window.DH_AUTH.getToken();
        const res = await fetch('/api/submissions', {
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
          throw new Error(data.error || 'Upload failed');
        }

        window.DH_AUTH.showToast('Submitted');
        fileInput.value = '';
        if (window.DH_APP && typeof window.DH_APP.refreshStudent === 'function') {
          await window.DH_APP.refreshStudent();
        }
      } catch (err) {
        window.DH_AUTH.showToast(err.message, true);
      }
    };
  }

  function bindMaterialUpload(formId) {
    const form = document.getElementById(formId);
    if (!form || form._mhBound) {
      return;
    }
    form._mhBound = true;
    form.onsubmit = async function (evt) {
      evt.preventDefault();
      const fd = new FormData(form);

      try {
        const token = window.DH_AUTH.getToken();
        const res = await fetch('/api/materials', {
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
          throw new Error(data.error || 'Upload failed');
        }

        window.DH_AUTH.showToast('Material uploaded');
        const fileInput = form.querySelector('input[type=file]');
        if (fileInput) fileInput.value = '';

        if (window.DH_APP && typeof window.DH_APP.refreshDoctorMaterials === 'function') {
          await window.DH_APP.refreshDoctorMaterials();
        }
      } catch (err) {
        window.DH_AUTH.showToast(err.message, true);
      }
    };
  }

  window.DH_UPLOAD_BIND = function () {
    bindSubmissionUpload('student-submit-form');
    bindMaterialUpload('doctor-material-form');
  };
})();
