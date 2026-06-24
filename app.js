// ============================================================
// app.js — Vikariekollen APP SHELL (boot, loaded LAST).
// Owns: login, header (logo + role switch + lang + logout),
// demo banner, nav/tab routing, and dispatch into VK.views.*.
//
// Storage-agnostic: talks to data only via window.Adapter (aliased
// VK.Adapter). Views are filled by views/*.js — app.js just routes
// the active tab/role into the right VK.views fn with a ctx object.
//
// Persisted UI state: vk_tab, vk_lang, vk_role (all via Adapter /
// localStorage helpers). Session: vk_user (sessionStorage).
//
// ASYNC NOTE: if Adapter functions become Promises at integration,
// await them here (login, role resolution) — mechanical change.
// ============================================================

(function () {
  'use strict';

  const VK = window.VK;
  const Adapter = window.Adapter;
  const { el, t, components } = VK;
  const TAB_KEY = 'vk_tab';

  const root = document.getElementById('app');

  // ----------------------------------------------------------
  // TAB DEFINITIONS by role
  // ----------------------------------------------------------
  const TABS = {
    coordinator: [
      { id: 'board',    labelKey: 'tabBoard',    view: 'board' },
      { id: 'schedule', labelKey: 'tabSchedule', view: 'schedule' },
      { id: 'pool',     labelKey: 'tabPool',     view: 'pool' },
      { id: 'settings', labelKey: 'tabSettings', view: 'settings' },
      { id: 'history',  labelKey: 'tabHistory',  view: 'history' },
    ],
    sub: [
      { id: 'subOffers',       labelKey: 'tabSubOffers',       view: 'subOffers' },
      { id: 'subBookings',     labelKey: 'tabSubBookings',     view: 'subBookings' },
      { id: 'subAvailability', labelKey: 'tabSubAvailability', view: 'subAvailability' },
    ],
    // Internal staff self-service (stubs filled by the staff-view builder).
    staff: [
      { id: 'staffRequests', labelKey: 'tabStaffRequests', view: 'staffRequests' },
      { id: 'staffCovers',   labelKey: 'tabStaffCovers',   view: 'staffCovers' },
      { id: 'staffWorkload', labelKey: 'tabStaffWorkload', view: 'staffWorkload' },
    ],
  };

  function getTab(role) {
    const set = TABS[role] || TABS.coordinator;
    const valid = set.map(x => x.id);
    const saved = localStorage.getItem(TAB_KEY);
    return valid.includes(saved) ? saved : set[0].id;
  }
  function setTab(id) { localStorage.setItem(TAB_KEY, id); }

  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------
  function renderLogin(errorMsg) {
    root.innerHTML = '';
    document.documentElement.lang = VK.lang.get();

    let pendingRole = 'sub';   // substitute is the default login

    const loginLang = el('div', { className: 'login-lang' },
      components.langToggle(() => renderLogin(errorMsg)));

    const logoWrap = el('div', { className: 'login-logo-wrap' },
      components.buildLogoSquares('lg'),
      el('div', { className: 'fvk-wordmark notranslate', translate: 'no', style: 'align-items:center;' },
        el('span', { className: 'fvk-wordmark-top' }, t('brandTop')),
        el('span', { className: 'fvk-wordmark-bot' }, t('brandBot'))
      )
    );

    // Three-way role selector. Substitute stays the default selected
    // option (prior decision); order Vikarie · Personal · Koordinator.
    const roleSeg = components.segmentedControl(
      [
        { value: 'sub',         label: t('roleSub') },
        { value: 'staff',       label: t('roleStaff') },
        { value: 'coordinator', label: t('roleCoordinator') },
      ],
      pendingRole,
      v => { pendingRole = v; },
      { className: 'role-seg-3' }
    );

    const emailInp = el('input', {
      type: 'email', id: 'login-email', className: 'text-input',
      placeholder: 'vikarie@skola.se', autocomplete: 'email',
    });
    const codeInp = el('input', {
      type: 'text', id: 'login-code', className: 'text-input',
      placeholder: '••••', inputmode: 'numeric', maxlength: '8',
    });
    codeInp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(pendingRole); });

    const card = el('div', { className: 'login-card' },
      logoWrap,
      el('h1', { className: 'login-title' }, t('signInTitle')),
      errorMsg ? el('p', { className: 'login-error' }, errorMsg) : null,
      el('label', { className: 'field-label' }, t('loginAsRole')),
      roleSeg,
      el('label', { className: 'field-label', for: 'login-email' }, t('emailLabel')),
      emailInp,
      el('label', { className: 'field-label', for: 'login-code' }, t('codeLabel')),
      codeInp,
      el('button', { className: 'btn btn-primary login-btn', onclick: () => doLogin(pendingRole) }, t('signInBtn')),
      el('p', { className: 'login-hint' }, t('demoHint'))
    );

    root.appendChild(loginLang);
    root.appendChild(el('div', { className: 'login-page' }, card));
    const ef = document.getElementById('login-email');
    if (ef) ef.focus();
  }

  function doLogin(role) {
    const email = document.getElementById('login-email').value.trim();
    const code  = document.getElementById('login-code').value.trim();
    const res = Adapter.login(email, code, role);
    if (res.ok) { renderApp(); }
    else { renderLogin(res.error || 'Fel vid inloggning'); }
  }

  function doLogout() {
    Adapter.logout();
    renderLogin();
  }

  // ----------------------------------------------------------
  // APP SHELL
  // ----------------------------------------------------------
  function renderApp() {
    const user = Adapter.getCurrentUser();
    if (!user) { renderLogin(); return; }
    const role = user.role || Adapter.getRole();

    root.innerHTML = '';
    document.documentElement.lang = VK.lang.get();

    root.appendChild(buildHeader(user, role));
    root.appendChild(buildDemoBanner());
    root.appendChild(buildNav(role));

    const content = el('main', { className: 'app-content', id: 'app-content' });
    root.appendChild(content);
    root.appendChild(buildFooter(role));

    renderActiveView(content, role);
  }

  function buildHeader(user, role) {
    // role switch — coordinator / staff / sub (three pools)
    const roleSwitch = components.segmentedControl(
      [
        { value: 'coordinator', label: t('roleCoordinator') },
        { value: 'staff',       label: t('roleStaff') },
        { value: 'sub',         label: t('roleSub') },
      ],
      role,
      v => {
        Adapter.setRole(v);
        // landing tab resets to the role's first tab
        setTab((TABS[v] || TABS.coordinator)[0].id);
        renderApp();
      },
      { className: 'role-switch' }
    );

    return el('header', { className: 'site-header' },
      components.buildLogo('sm'),
      el('div', { className: 'header-right' },
        roleSwitch,
        components.langToggle(() => renderApp()),
        el('span', { className: 'user-email' }, user.name || user.email),
        el('button', { className: 'btn btn-ghost', onclick: doLogout }, t('logout'))
      )
    );
  }

  function buildDemoBanner() {
    return el('div', { className: 'demo-banner' },
      el('span', {}, '⚠'),
      el('span', {}, t('demoBanner'))
    );
  }

  function buildNav(role) {
    const active = getTab(role);
    const nav = el('nav', { className: 'app-nav' });
    TABS[role].forEach(tab => {
      nav.appendChild(el('button', {
        className: 'nav-tab' + (tab.id === active ? ' active' : ''),
        onclick: () => {
          setTab(tab.id);
          // update active classes + re-render content only
          nav.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
          const me = nav.querySelector(`[data-tab="${tab.id}"]`);
          if (me) me.classList.add('active');
          const content = document.getElementById('app-content');
          if (content) renderActiveView(content, role);
        },
        data: { tab: tab.id },
      }, t(tab.labelKey)));
    });
    return nav;
  }

  function buildFooter(role) {
    const build = window.VK_BUILD || { version: 'dev', build: 0, date: '' };
    const buildLabel = 'v' + build.version + ' · build ' + build.build;
    // DEMO-ONLY view switcher: when running standalone (not embedded in the
    // FVK shell), offer a link to the "inside Frånvarokollen" demo view.
    // Never shown in production — purely to preview both presentations.
    const embedded = window.self !== window.top;
    const lang = VK.lang.get();
    const switchLabel = lang === 'en' ? '▸ View in Frånvarokollen (demo)'
                                      : '▸ Visa i Frånvarokollen (demo)';
    const switchTitle = lang === 'en' ? 'Demo only — preview VK embedded in Frånvarokollen'
                                      : 'Endast demo — förhandsvisa VK inbäddad i Frånvarokollen';
    return el('div', { className: 'app-footer' },
      el('span', { className: 'footer-copy' }, t('footerCopy')),
      embedded ? null : el('a', {
        href: 'fvk-shell.html', title: switchTitle,
        style: 'font-size:11px;margin-left:12px;color:var(--blue,#0F71F6);text-decoration:none;align-self:center;',
      }, switchLabel),
      el('span', {
        title: build.date,
        style: 'font-size:11px;color:var(--muted,#9ca3af);margin-left:auto;align-self:center;',
      }, buildLabel),
      el('div', { className: 'footer-actions' },
        // dev: advance the simulated clock to drive cascades
        el('button', {
          className: 'btn btn-ghost-border btn-sm',
          title: 'Adapter.advanceClock(15)',
          onclick: () => {
            const r = Adapter.advanceClock(15);
            components.confirmToast(
              t('advanceClock') + ' +15 ' + t('minutesShort') +
              (r.transitions ? ' · ' + r.transitions : ''),
              'blue'
            );
            renderApp();
          },
        }, '⏩ ' + t('advanceClock')),
        el('button', {
          className: 'btn btn-ghost',
          onclick: () => {
            Adapter.resetDemo();
            renderApp();
            components.confirmToast(t('saved'), 'green');
          },
        }, t('reset'))
      )
    );
  }

  // ----------------------------------------------------------
  // VIEW DISPATCH
  // ----------------------------------------------------------
  function renderActiveView(content, role) {
    content.innerHTML = '';
    const tabId = getTab(role);
    const tab = TABS[role].find(x => x.id === tabId) || TABS[role][0];
    const viewFn = VK.views[tab.view];

    const ctx = {
      Adapter, el, t,
      fmt: VK.fmt,
      components,
      user: Adapter.getCurrentUser(),
      role,
      rerender: () => renderActiveView(document.getElementById('app-content'), role),
      setTab: (id) => {
        setTab(id);
        renderApp();
      },
    };

    if (typeof viewFn === 'function') {
      try { viewFn(content, ctx); }
      catch (err) {
        content.appendChild(components.emptyState('⚠', 'View error', String(err && err.message || err)));
      }
    } else {
      content.appendChild(components.emptyState('◎', tab.view, VK.t('comingSoon')));
    }
  }

  // ----------------------------------------------------------
  // BOOT
  // ----------------------------------------------------------
  function init() {
    if (Adapter.getCurrentUser()) renderApp();
    else renderLogin();
  }

  init();

}());
