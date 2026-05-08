(function () {
  const TOKEN_KEY = 'damanhour_jwt_token';
  const LANG_KEY = 'damanhour_lang';

  const I18N = {
    en: {
      uni: 'Damanhour University',
      faculty: 'Faculty of Science',
      tagline: 'Digital campus for courses, assignments, and academic records',
      langEn: 'English',
      langAr: 'English',
      loginTab: 'Sign in',
      registerTab: 'Register',
      email: 'Email',
      password: 'Password',
      name: 'Full name',
      academicYear: 'Academic year (optional)',
      department: 'Department (optional)',
      signIn: 'Sign in',
      createAccount: 'Create student account',
      logout: 'Log out',
      profile: 'Profile',
      dashboard: 'Dashboard',
      notifications: 'Notifications',
      studentPanel: 'Student space',
      doctorPanel: 'Doctor space',
      adminPanel: 'Administration',
      courses: 'Courses',
      studentCoursesHint: 'Click a course to open its materials.',
      studentSubmitTitle: 'Submit assignment file',
      assignments: 'Assignments',
      materials: 'Materials',
      submissions: 'Submissions & grading',
      users: 'Users',
      analytics: 'Statistics',
      exports: 'Data export',
      smartDashboard: 'Smart control panel',
      welcomeBack: 'Welcome back',
      saveProfile: 'Save profile',
      currentPassword: 'Current password',
      newPassword: 'New password',
      roleLabel: 'Role',
      authSwitchHint:
        'New accounts are created by administrators only.',
      authFeature1: 'Courses, assignments, and materials in one place',
      authFeature2: 'Notifications and reminders for deadlines',
      authFeature3: 'Secure access based on your role',
      staffProvisionNote: 'Doctor and admin accounts are created by faculty staff — not via this form.',
      logoAlt: 'Damanhour University — Faculty of Science',
    },
    ar: {
      uni: 'Damanhour University',
      faculty: 'Faculty of Science',
      tagline: 'Digital campus for courses, assignments, and academic records',
      langEn: 'English',
      langAr: 'English',
      loginTab: 'Sign in',
      registerTab: 'Register',
      email: 'Email',
      password: 'Password',
      name: 'Full name',
      academicYear: 'Academic year (optional)',
      department: 'Department (optional)',
      signIn: 'Sign in',
      createAccount: 'Create student account',
      logout: 'Log out',
      profile: 'Profile',
      dashboard: 'Dashboard',
      notifications: 'Notifications',
      studentPanel: 'Student space',
      doctorPanel: 'Doctor space',
      adminPanel: 'Administration',
      courses: 'Courses',
      studentCoursesHint: 'Click a course to open its materials.',
      studentSubmitTitle: 'Submit assignment file',
      assignments: 'Assignments',
      materials: 'Materials',
      submissions: 'Submissions & grading',
      users: 'Users',
      analytics: 'Statistics',
      exports: 'Data export',
      smartDashboard: 'Smart control panel',
      welcomeBack: 'Welcome back',
      saveProfile: 'Save profile',
      currentPassword: 'Current password',
      newPassword: 'New password',
      roleLabel: 'Role',
      authSwitchHint:
        'New accounts are created by administrators only.',
      authFeature1: 'Courses, assignments, and materials in one place',
      authFeature2: 'Notifications and reminders for deadlines',
      authFeature3: 'Secure access based on your role',
      staffProvisionNote: 'Doctor and admin accounts are created by faculty staff — not via this form.',
      logoAlt: 'Damanhour University — Faculty of Science',
    },
  };

  function getLang() {
    return 'en';
  }

  function setLang(code) {
    const next = 'en';
    localStorage.setItem(LANG_KEY, next);
    document.documentElement.lang = next;
    document.body.setAttribute('dir', 'ltr');
    applyTranslations();
    syncAuthPanelTitle();
    window.dispatchEvent(new CustomEvent('damanhour:langchange', { detail: { lang: next } }));
  }

  function t(key) {
    const lang = getLang();
    return I18N[lang][key] || I18N.en[key] || key;
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      const key = node.getAttribute('data-i18n');
      node.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
      const key = node.getAttribute('data-i18n-placeholder');
      node.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (node) {
      const key = node.getAttribute('data-i18n-alt');
      node.setAttribute('alt', t(key));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      const key = node.getAttribute('data-i18n-title');
      node.setAttribute('title', t(key));
    });
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  function clearAuth() {
    setToken(null);
    window.DH_APP_STATE.user = null;
  }

  async function apiJson(path, options) {
    const headers = options && options.headers ? { ...options.headers } : {};
    if (!(options && options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const token = getToken();
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    const res = await fetch(path, {
      ...options,
      headers,
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }

    if (!res.ok) {
      const msg = data.error || 'Request failed';
      throw new Error(msg);
    }
    return data;
  }

  function showToast(message, isError) {
    let el = document.getElementById('global-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'global-toast';
      el.style.position = 'fixed';
      el.style.bottom = '22px';
      el.style.right = document.body.getAttribute('dir') === 'rtl' ? 'auto' : '22px';
      el.style.left = document.body.getAttribute('dir') === 'rtl' ? '22px' : 'auto';
      el.style.zIndex = '9999';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '999px';
      el.style.border = '1px solid rgba(255,255,255,0.12)';
      el.style.boxShadow = '0 12px 32px rgba(0,0,0,0.45)';
      el.style.fontWeight = '600';
      document.body.appendChild(el);
    }
    el.style.background = isError
      ? 'rgba(255, 107, 107, 0.92)'
      : 'rgba(17,24,51,0.96)';
    el.style.color = isError ? '#1a0b0c' : '#e8ecff';
    el.textContent = message;
    el.hidden = false;
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.hidden = true;
    }, 3200);
  }

  async function bootstrapMe() {
    const token = getToken();
    if (!token) {
      window.DH_APP_STATE.user = null;
      return null;
    }
    try {
      const data = await apiJson('/api/auth/me');
      window.DH_APP_STATE.user = data.user;
      return data.user;
    } catch (_) {
      clearAuth();
      return null;
    }
  }

  function syncAuthPanelTitle() {
    var paneReg = document.getElementById('pane-register');
    var titleEl = document.getElementById('auth-form-title');
    if (!paneReg || !titleEl) {
      return;
    }
    var isRegister = !paneReg.classList.contains('hidden');
    titleEl.textContent = t(isRegister ? 'registerTab' : 'loginTab');
  }

  function setAuthTab(mode) {
    var loginTab = document.getElementById('auth-tab-login');
    var regTab = document.getElementById('auth-tab-register');
    var paneLogin = document.getElementById('pane-login');
    var paneReg = document.getElementById('pane-register');
    if (!loginTab || !regTab || !paneLogin || !paneReg) {
      return;
    }
    var isLogin = mode !== 'register';
    loginTab.classList.toggle('is-active', isLogin);
    regTab.classList.toggle('is-active', !isLogin);
    loginTab.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    regTab.setAttribute('aria-selected', isLogin ? 'false' : 'true');
    paneLogin.classList.toggle('hidden', !isLogin);
    paneReg.classList.toggle('hidden', isLogin);
    syncAuthPanelTitle();
  }

  function switchToLoginTab() {
    setAuthTab('login');
  }

  function toggleShell(showApp) {
    document.getElementById('screen-auth').classList.toggle('hidden', showApp);
    document.getElementById('screen-app').classList.toggle('hidden', !showApp);
    if (!showApp) {
      switchToLoginTab();
    }
  }

  function bindLangButtons() {
    var btnEn = document.getElementById('btn-lang-en');
    var btnAr = document.getElementById('btn-lang-ar');
    if (btnEn) {
      btnEn.onclick = function () {
        setLang('en');
      };
    }
    if (btnAr) {
      btnAr.onclick = function () {
        setLang('ar');
      };
    }
  }

  window.DH_AUTH = {
    TOKEN_KEY: TOKEN_KEY,
    getLang: getLang,
    setLang: setLang,
    t: t,
    applyTranslations: applyTranslations,
    getToken: getToken,
    setToken: setToken,
    clearAuth: clearAuth,
    apiJson: apiJson,
    showToast: showToast,
    bootstrapMe: bootstrapMe,
    toggleShell: toggleShell,
    switchToLoginTab: switchToLoginTab,
    bindLangButtons: bindLangButtons,
  };

  window.DH_APP_STATE = { user: null };

  async function loginSubmit(evt) {
    evt.preventDefault();
    const fd = new FormData(evt.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      const data = await apiJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToken(data.token);
      window.DH_APP_STATE.user = data.user;
      showToast('OK');
      toggleShell(true);
      if (window.DH_APP && typeof window.DH_APP.onLoginSuccess === 'function') {
        await window.DH_APP.onLoginSuccess();
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function registerSubmit(evt) {
    evt.preventDefault();
    const fd = new FormData(evt.target);
    const payload = Object.fromEntries(fd.entries());
    payload.role = 'student';
    try {
      const data = await apiJson('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToken(data.token);
      window.DH_APP_STATE.user = data.user;
      showToast(t('welcomeBack'));
      toggleShell(true);
      if (window.DH_APP && typeof window.DH_APP.onLoginSuccess === 'function') {
        await window.DH_APP.onLoginSuccess();
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function logoutClick() {
    clearAuth();
    toggleShell(false);
    if (window.DH_NOTIFICATIONS && typeof window.DH_NOTIFICATIONS.reset === 'function') {
      window.DH_NOTIFICATIONS.reset();
    }
  }

  function initAuthScreens() {
    bindLangButtons();
    setLang('en');

    document.getElementById('login-form').onsubmit = loginSubmit;
    var registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.onsubmit = registerSubmit;
    }

    document.getElementById('logout-btn-sidebar').onclick = logoutClick;

    var authTabLogin = document.getElementById('auth-tab-login');
    var authTabRegister = document.getElementById('auth-tab-register');
    if (authTabLogin) {
      authTabLogin.onclick = function () {
        setAuthTab('login');
      };
    }

    if (authTabRegister) {
      authTabRegister.onclick = function () {
        setAuthTab('register');
      };
    }

    bootstrapMe().then(function (user) {
      if (user) {
        toggleShell(true);
        if (window.DH_APP && typeof window.DH_APP.onLoginSuccess === 'function') {
          window.DH_APP.onLoginSuccess();
        }
      } else {
        toggleShell(false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initAuthScreens);
})();



