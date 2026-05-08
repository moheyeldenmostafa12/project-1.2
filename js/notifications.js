(function () {
  let pollTimer = null;

  function reset() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    updateBadge([]);
  }

  function updateBadge(rows) {
    const badge = document.getElementById('notif-sidebar-count');
    if (!badge) {
      return;
    }
    const unread = rows.filter(function (x) {
      return !x.is_read;
    }).length;
    badge.textContent = String(unread);
    const wrap = document.getElementById('sidebar-notif-wrap');
    if (wrap) {
      wrap.hidden = unread === 0;
    }
    const headBadge = document.getElementById('header-notif-badge');
    if (headBadge) {
      headBadge.textContent = String(unread);
      headBadge.hidden = unread === 0;
    }
  }

  function renderList(rows) {
    const host = document.getElementById('notif-list');
    host.innerHTML = '';
    rows.forEach(function (n) {
      const div = document.createElement('div');
      div.className = 'notif-item' + (n.is_read ? '' : ' unread');
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;gap:.5rem;"><strong>' +
        escapeHtml(n.title) +
        '</strong><small>' +
        escapeHtml(n.created_at || '') +
        '</small></div><div>' +
        escapeHtml(n.message || '') +
        '</div>';

      div.onclick = function () {
        if (!n.is_read) {
          window.DH_AUTH
            .apiJson('/api/notifications/' + n.id + '/read', {
              method: 'PATCH',
            })
            .then(function () {
              n.is_read = 1;
              updateBadge(rows);
              div.classList.remove('unread');
            })
            .catch(function (_) {});
        }
      };
      host.appendChild(div);
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function reload() {
    if (!window.DH_AUTH.getToken()) {
      return;
    }
    try {
      const data = await window.DH_AUTH.apiJson('/api/notifications');
      renderList(data.notifications || []);
      updateBadge(data.notifications || []);
    } catch (_) {
      /* ignore */
    }
  }

  function startPolling() {
    reset();
    reload().catch(function (_) {});
    pollTimer = setInterval(function () {
      reload().catch(function (_) {});
    }, 15000);
  }

  async function markAllReadBtn() {
    try {
      await window.DH_AUTH.apiJson('/api/notifications/read-all', {
        method: 'PATCH',
      });
      await reload();
      window.DH_AUTH.showToast('Done');
    } catch (err) {
      window.DH_AUTH.showToast(err.message, true);
    }
  }

  window.DH_NOTIFICATIONS = {
    reset: reset,
    reload: reload,
    startPolling: startPolling,
    markAllReadBtn: markAllReadBtn,
  };

  window.addEventListener('damanhour:langchange', function () {
    reload().catch(function (_) {});
  });

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('notif-mark-all-read');
    if (btn) {
      btn.onclick = markAllReadBtn;
    }
  });
})();
