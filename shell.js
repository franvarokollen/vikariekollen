// ============================================================
// shell.js — VK namespace: i18n, el() DOM helper, formatters,
// and shared UI components. Loaded AFTER adapter.js and BEFORE
// the view files + app.js.
//
// Everything a view-builder needs hangs off window.VK:
//   VK.el         DOM helper (same contract as the sibling module)
//   VK.t          i18n translate
//   VK.lang       getLang() / setLang()
//   VK.Adapter    alias of window.Adapter
//   VK.fmt        formatters (all rounded)
//   VK.components  shared UI builders
//   VK.views       filled by views/*.js (board, pool, …)
//
// Views NEVER touch storage directly — go through VK.Adapter.*.
// ============================================================

(function () {
  'use strict';

  const VK = (window.VK = window.VK || {});
  VK.Adapter = window.Adapter;
  VK.views = VK.views || {};

  const LANG_KEY = 'vk_lang';

  // ----------------------------------------------------------
  // I18N
  // ----------------------------------------------------------
  const i18n = {
    sv: {
      // -- App / brand --
      brandTop: 'Vikarie', brandBot: 'Kollen',
      appTitle: 'Vikariekollen',

      // -- Auth --
      signInTitle: 'Logga in', emailLabel: 'E-post', codeLabel: 'Kod',
      signInBtn: 'Logga in', demoHint: 'Demo – valfri inloggning', logout: 'Logga ut',
      roleCoordinator: 'Koordinator', roleSub: 'Vikarie', roleStaff: 'Personal',
      loginAsRole: 'Logga in som',

      // -- Banner --
      demoBanner: 'Demo — inga riktiga vikarier kontaktas. Allt simuleras.',

      // -- Nav tabs (coordinator) --
      tabBoard: 'Tavla', tabPool: 'Vikarier', tabSettings: 'Inställningar', tabHistory: 'Historik',
      // -- Nav tabs (sub) --
      tabSubOffers: 'Mina erbjudanden', tabSubBookings: 'Mina pass',
      tabSubAvailability: 'Min tillgänglighet',
      // -- Nav tabs (staff) --
      tabStaffRequests: 'Förfrågningar', tabStaffCovers: 'Mina vikariat', tabStaffWorkload: 'Min arbetsbörda',

      // -- Gap statuses --
      statusOpenUnsent: 'Öppen · ej skickad', statusCascade: 'Kaskad pågår',
      statusOpenPool: 'Öppen pool', statusFilled: 'Tillsatt', statusExpired: 'Utgången',

      // -- Offer modes --
      modeAdminAssign: 'Admin tillsätter', modeOpenPool: 'Öppen pool', modeCascade: 'Kaskad',

      // -- Target / candidate states --
      stateContacted: 'Kontaktad', stateQueued: 'I kö', stateAccepted: 'Accepterat',
      stateDeclined: 'Tackade nej', stateSuperseded: 'Ersatt', statePending: 'Ej skickad',

      // -- Shared --
      reset: 'Återställ demo', save: 'Spara', cancel: 'Avbryt', close: 'Stäng',
      confirm: 'Bekräfta', saved: 'Sparat', perHour: 'kr/h', lessons: 'lekt.',
      absent: 'frånvarande', reliability: 'Pålitlighet', advanceClock: 'Spola tid',
      now: 'Nu', minutesShort: 'min',

      // -- Empty state / stubs --
      comingSoon: 'Snart här', stubBoard: 'Tavlan byggs av nästa agent.',
      stubPool: 'Vikariepoolen byggs av nästa agent.',
      stubSettings: 'Inställningarna byggs av nästa agent.',
      stubHistory: 'Historik & analys byggs av nästa agent.',
      stubSubOffers: 'Dina erbjudanden byggs av nästa agent.',
      stubSubBookings: 'Dina pass byggs av nästa agent.',
      stubStaffRequests: 'Förfrågningar byggs av nästa agent.',
      stubStaffCovers: 'Dina vikariat byggs av nästa agent.',
      stubStaffWorkload: 'Din arbetsbörda byggs av nästa agent.',
      stubNote: 'Datalagret (Adapter) är klart — den här vyn ska anropa det.',

      // -- Footer --
      footerCopy: '© Vikariekollen',
    },

    en: {
      brandTop: 'Vikarie', brandBot: 'Kollen',
      appTitle: 'Vikariekollen',

      signInTitle: 'Sign in', emailLabel: 'Email', codeLabel: 'Access code',
      signInBtn: 'Sign in', demoHint: 'Demo — any credentials work', logout: 'Log out',
      roleCoordinator: 'Coordinator', roleSub: 'Substitute', roleStaff: 'Staff',
      loginAsRole: 'Sign in as',

      demoBanner: 'Demo — no real substitutes are contacted. Everything is simulated.',

      tabBoard: 'Board', tabPool: 'Substitutes', tabSettings: 'Settings', tabHistory: 'History',
      tabSubOffers: 'My offers', tabSubBookings: 'My bookings',
      tabSubAvailability: 'My availability',
      tabStaffRequests: 'Requests', tabStaffCovers: 'My covers', tabStaffWorkload: 'My workload',

      statusOpenUnsent: 'Open · not sent', statusCascade: 'Cascade active',
      statusOpenPool: 'Open pool', statusFilled: 'Filled', statusExpired: 'Expired',

      modeAdminAssign: 'Admin assigns', modeOpenPool: 'Open pool', modeCascade: 'Cascade',

      stateContacted: 'Contacted', stateQueued: 'Queued', stateAccepted: 'Accepted',
      stateDeclined: 'Declined', stateSuperseded: 'Superseded', statePending: 'Not sent',

      reset: 'Reset demo', save: 'Save', cancel: 'Cancel', close: 'Close',
      confirm: 'Confirm', saved: 'Saved', perHour: 'kr/h', lessons: 'lessons',
      absent: 'absent', reliability: 'Reliability', advanceClock: 'Advance time',
      now: 'Now', minutesShort: 'min',

      comingSoon: 'Coming soon', stubBoard: 'The board view will be built by the next agent.',
      stubPool: 'The substitute pool will be built by the next agent.',
      stubSettings: 'Settings will be built by the next agent.',
      stubHistory: 'History & analytics will be built by the next agent.',
      stubSubOffers: 'Your offers view will be built by the next agent.',
      stubSubBookings: 'Your bookings view will be built by the next agent.',
      stubStaffRequests: 'The requests view will be built by the next agent.',
      stubStaffCovers: 'Your covers view will be built by the next agent.',
      stubStaffWorkload: 'Your workload view will be built by the next agent.',
      stubNote: 'The data layer (Adapter) is complete — this view should call it.',

      footerCopy: '© Vikariekollen',
    },
  };

  function getLang() { return localStorage.getItem(LANG_KEY) || 'sv'; }
  function setLang(l) { localStorage.setItem(LANG_KEY, l === 'en' ? 'en' : 'sv'); }
  function t(key) { return (i18n[getLang()] || i18n.sv)[key] || key; }

  VK.i18n = i18n;
  VK.t = t;
  VK.lang = { get: getLang, set: setLang };

  // ----------------------------------------------------------
  // el() — DOM helper (identical contract to the sibling module)
  // ----------------------------------------------------------
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'className') node.className = v;
        else if (k.startsWith('on') && typeof v === 'function') node[k] = v;
        else if (k === 'data') { for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv; }
        else if (k === 'html') node.innerHTML = v; // trusted strings only
        else node.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }
  VK.el = el;

  // ----------------------------------------------------------
  // FORMATTERS (all rounded)
  // ----------------------------------------------------------
  const MONTHS = {
    sv: ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'],
    en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  };

  const WEEKDAYS = {
    sv: ['sön','mån','tis','ons','tor','fre','lör'],
    en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  };

  VK.fmt = {
    // Compact human duration from milliseconds.
    // SV: "15 min", "4 tim", "1 dag 4 tim", "2 dagar"
    // EN: "15 min", "4 hr",  "1 day 4 hr",  "2 days"
    dur(ms) {
      const lang = getLang();
      const totalMin = Math.round(ms / 60000);
      if (totalMin < 1) return lang === 'en' ? '< 1 min' : '< 1 min';
      if (totalMin < 60) return totalMin + ' min';
      const totalHr = Math.floor(totalMin / 60);
      const days    = Math.floor(totalHr / 24);
      const remHr   = totalHr % 24;
      if (lang === 'en') {
        if (days === 0) return totalHr + ' hr';
        if (remHr === 0) return days + (days === 1 ? ' day' : ' days');
        return days + (days === 1 ? ' day ' : ' days ') + remHr + ' hr';
      } else {
        if (days === 0) return totalHr + ' tim';
        if (remHr === 0) return days + (days === 1 ? ' dag' : ' dagar');
        return days + (days === 1 ? ' dag ' : ' dagar ') + remHr + ' tim';
      }
    },

    // Forward deadline phrase from nowMs to iso timestamp.
    // Within 24 h → "om 3 tim" / "in 3 hr"
    // Within 7 days → "senast tor 14:00" / "by Thu 14:00"
    // Beyond 7 days → "om 2 dagar" / "in 2 days"
    // In the past → "utgången" / "expired"
    until(iso, nowMs) {
      if (!iso) return '';
      const lang = getLang();
      const targetMs = typeof iso === 'string' ? Date.parse(iso) : Number(iso);
      const diffMs   = targetMs - nowMs;
      if (diffMs <= 0) return lang === 'en' ? 'expired' : 'utgången';
      const diffMin  = Math.round(diffMs / 60000);
      if (diffMin < 60) {
        return lang === 'en' ? 'in ' + diffMin + ' min' : 'om ' + diffMin + ' min';
      }
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) {
        return lang === 'en' ? 'in ' + diffHr + ' hr' : 'om ' + diffHr + ' tim';
      }
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays < 7) {
        const d   = new Date(targetMs);
        const wd  = (WEEKDAYS[lang] || WEEKDAYS.sv)[d.getDay()];
        const hh  = String(d.getHours()).padStart(2, '0');
        const mm  = String(d.getMinutes()).padStart(2, '0');
        return lang === 'en' ? 'by ' + wd + ' ' + hh + ':' + mm
                             : 'senast ' + wd + ' ' + hh + ':' + mm;
      }
      return lang === 'en'
        ? 'in ' + diffDays + (diffDays === 1 ? ' day' : ' days')
        : 'om ' + diffDays + (diffDays === 1 ? ' dag' : ' dagar');
    },

    // "2026-06-24" → "24 jun"
    date(iso) {
      if (!iso) return '';
      const [, m, d] = iso.split('-');
      const months = MONTHS[getLang()] || MONTHS.sv;
      return parseInt(d, 10) + ' ' + (months[parseInt(m, 10) - 1] || m);
    },
    // "2026-06-24" → "24 jun 2026"
    dateLong(iso) {
      if (!iso) return '';
      const [y] = iso.split('-');
      return VK.fmt.date(iso) + ' ' + y;
    },
    // "08:20" + "10:05" → "08:20–10:05"
    timeRange(a, b) { return a + '–' + b; },
    // ISO timestamp → short clock "14:32"
    clock(isoTs) {
      if (!isoTs) return '';
      const d = new Date(isoTs);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    },
    // 3200 → "3 200 kr"
    currency(n) {
      const v = Math.round(Number(n) || 0);
      return v.toLocaleString('sv-SE').replace(/,/g, ' ') + ' kr';
    },
    // 87.4 → "87"
    int(n) { return String(Math.round(Number(n) || 0)); },
    // 0.874 already a percent int → "87 %"
    percent(n) { return Math.round(Number(n) || 0) + ' %'; },
    lessons(n) { return Math.round(Number(n) || 0) + ' ' + t('lessons'); },
  };

  // ----------------------------------------------------------
  // BRAND MARKS
  // ----------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Vikariekollen mark: navy rounded tile with a two-way swap arrow (⇄)
  // — the "substitute / handover" symbol. Navy + blue + white, on FVK brand.
  function buildLogoSquares(size) {
    const dim = size === 'lg' ? 38 : 28;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', dim); svg.setAttribute('height', dim);
    svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('fvk-logo-squares');

    const tile = document.createElementNS(SVG_NS, 'rect');
    tile.setAttribute('x', 0); tile.setAttribute('y', 0);
    tile.setAttribute('width', 40); tile.setAttribute('height', 40);
    tile.setAttribute('rx', 9); tile.setAttribute('fill', '#1B4776');
    svg.appendChild(tile);

    const mk = (d, stroke) => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', 3);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      return p;
    };
    // top arrow → (white), bottom arrow ← (brand blue): a swap
    svg.appendChild(mk('M10 16 H28 M23 12 L28 16 L23 20', '#ffffff'));
    svg.appendChild(mk('M30 25 H12 M17 21 L12 25 L17 29', '#0F71F6'));
    return svg;
  }

  function buildLogo(size) {
    return el('div', { className: 'fvk-logo notranslate', translate: 'no' },
      buildLogoSquares(size),
      el('div', { className: 'fvk-wordmark notranslate', translate: 'no' },
        el('span', { className: 'fvk-wordmark-top' }, t('brandTop')),
        el('span', { className: 'fvk-wordmark-bot' }, t('brandBot'))
      )
    );
  }

  // ----------------------------------------------------------
  // SHARED COMPONENTS
  // ----------------------------------------------------------
  // statePill(state) — maps a candidate/target state to a labelled pill.
  const STATE_PILL = {
    contacted:  ['pill-contacted',  'stateContacted'],
    queued:     ['pill-queued',     'stateQueued'],
    accepted:   ['pill-accepted',   'stateAccepted'],
    declined:   ['pill-declined',   'stateDeclined'],
    superseded: ['pill-superseded', 'stateSuperseded'],
    pending:    ['pill-pending',    'statePending'],
    expired:    ['pill-declined',   'stateDeclined'],
  };
  function statePill(state) {
    const [cls, key] = STATE_PILL[state] || ['pill-pending', 'statePending'];
    return el('span', { className: 'state-pill ' + cls }, t(key));
  }

  // statusBadge(status) — gap status → coloured badge (board uses this).
  const STATUS_BADGE = {
    open_unsent: ['badge-amber', 'statusOpenUnsent'],
    cascade:     ['badge-blue',  'statusCascade'],
    open_pool:   ['badge-blue',  'statusOpenPool'],
    filled:      ['badge-green', 'statusFilled'],
    expired:     ['badge-muted', 'statusExpired'],
  };
  function statusBadge(status, suffix) {
    const [cls, key] = STATUS_BADGE[status] || ['badge-muted', status];
    return el('span', { className: 'status-badge ' + cls }, t(key) + (suffix ? ' · ' + suffix : ''));
  }

  // metricCard(label, value)
  function metricCard(label, value) {
    return el('div', { className: 'stat-card' },
      el('div', { className: 'stat-value' }, String(value)),
      el('div', { className: 'stat-label' }, label)
    );
  }

  // avatar(initials, opts?: { sm?:bool, violet?:bool })
  function avatar(initials, opts) {
    const o = opts || {};
    let cls = 'initials-avatar';
    if (o.sm) cls += ' sm';
    if (o.violet) cls += ' violet';
    return el('div', { className: cls }, initials || '?');
  }

  // badge(text, variant) — generic small pill ('blue'|'green'|'amber'|'muted'|'violet')
  function badge(text, variant) {
    return el('span', { className: 'vk-badge vk-badge-' + (variant || 'muted') }, text);
  }

  // emptyState(icon, msg, sub?) — placeholder block
  function emptyState(icon, msg, sub) {
    return el('div', { className: 'empty-state' },
      el('div', { className: 'empty-state-icon' }, icon || '◎'),
      el('div', { className: 'empty-state-msg' }, msg || ''),
      sub ? el('div', { className: 'empty-state-sub' }, sub) : null
    );
  }

  // modal(opts) — { title, body (DOM node|string-html), tag?, buttons:[{label,primary,onClick}] }
  // Returns a close() fn. body strings are set as innerHTML (trusted only).
  function modal(opts) {
    const existing = document.getElementById('vk-modal');
    if (existing) existing.remove();

    const titleEl = el('div', { className: 'modal-title' }, opts.title || '');

    let bodyEl;
    if (opts.body instanceof Node) {
      bodyEl = el('div', { className: 'modal-body' }, opts.body);
    } else {
      bodyEl = el('div', { className: 'modal-body' });
      bodyEl.innerHTML = opts.body || '';
    }

    const tagEl = opts.tag
      ? el('div', {}, el('span', { className: 'modal-integration-tag' }, '⚡ ' + opts.tag))
      : null;

    const overlay = el('div', { className: 'modal-overlay', id: 'vk-modal' });
    function close() { overlay.remove(); }

    const footerBtns = (opts.buttons || []).map(b =>
      el('button', {
        className: 'btn ' + (b.primary ? 'btn-primary' : 'btn-ghost-border'),
        onclick: () => { close(); if (b.onClick) b.onClick(); },
      }, b.label)
    );
    const footer = footerBtns.length ? el('div', { className: 'modal-footer' }, ...footerBtns) : null;

    const card = el('div', { className: 'modal-card' },
      titleEl, bodyEl, tagEl, footer);
    overlay.appendChild(card);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return close;
  }

  // confirmToast(msg, variant?) — brief floating note bottom-right
  function confirmToast(msg, variant) {
    const old = document.getElementById('vk-toast');
    if (old) old.remove();
    const note = el('div', {
      id: 'vk-toast',
      className: 'vk-toast vk-toast-' + (variant || 'green'),
    }, msg);
    document.body.appendChild(note);
    setTimeout(() => { const n = document.getElementById('vk-toast'); if (n) n.remove(); }, 3500);
  }

  // segmentedControl(options, active, onChange)
  //   options: [{ value, label }]  active: value  onChange: (value)=>void
  function segmentedControl(options, active, onChange, opts) {
    const o = opts || {};
    const wrap = el('div', { className: 'mode-control' + (o.className ? ' ' + o.className : '') });
    options.forEach(opt => {
      const btn = el('button', {
        className: 'mode-btn' + (opt.value === active ? ' active' : ''),
        disabled: o.disabled ? 'true' : null,
        onclick: o.disabled ? null : () => {
          wrap.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (onChange) onChange(opt.value);
        },
      }, opt.label);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  // langToggle(onToggle)
  function langToggle(onToggle) {
    const lang = getLang();
    const wrap = el('div', { className: 'lang-toggle' });
    wrap.appendChild(el('button', {
      className: 'lang-btn' + (lang === 'sv' ? ' active' : ''),
      onclick: () => { setLang('sv'); onToggle && onToggle(); },
    }, 'SV'));
    wrap.appendChild(el('button', {
      className: 'lang-btn' + (lang === 'en' ? ' active' : ''),
      onclick: () => { setLang('en'); onToggle && onToggle(); },
    }, 'EN'));
    return wrap;
  }

  VK.components = {
    buildLogo, buildLogoSquares,
    statePill, statusBadge, metricCard, avatar, badge,
    emptyState, modal, confirmToast, segmentedControl, langToggle,
  };

}());
