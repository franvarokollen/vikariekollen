// ============================================================
// app.js — Vikariekollen Substitute Offer & Booking UI
// Coordinator-facing. Talks to storage only through window.Adapter.
// Never touches localStorage, sessionStorage, Supabase, or any
// network directly — all storage goes through Adapter.*.
// ============================================================

(function () {
  'use strict';

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------
  let expandedGapId = null; // which gap row is open (accordion)

  // ----------------------------------------------------------
  // I18N
  // ----------------------------------------------------------
  const LANG_KEY = 'vk_lang';

  const i18n = {
    sv: {
      // Auth
      signInTitle:        'Logga in',
      emailLabel:         'E-post',
      codeLabel:          'Kod',
      signInBtn:          'Logga in',
      demoHint:           'Demo – valfri inloggning',
      logout:             'Logga ut',

      // Banner
      demoBanner:         'Demo — inga riktiga vikarier kontaktas. Allt simuleras.',

      // Stats
      statOpenGaps:       'Öppna luckor',
      statOffersOut:      'Erbjudanden ute',
      statFilledToday:    'Tillsatta idag',
      statSubsAvail:      'Vikarier tillgängliga',

      // Board
      lapsSection:        'Luckor att fylla',
      newOfferBtn:        'Nytt erbjudande',
      absent:             'frånvarande',

      // Gap status badges
      badgeOpenUnsent:    'Öppen · ej skickad',
      badgeCascade:       'Kaskad pågår',
      badgeOpenPool:      'Öppen pool',
      badgeFilled:        'Tillsatt',

      // Mode control
      modeAdminAssign:    'Admin tillsätter',
      modeOpenPool:       'Öppen pool',
      modeCascade:        'Kaskad',

      // Mode explainers
      modeAdminExplain:   'Du väljer vikarie direkt. Ingen SMS skickas.',
      modePoolExplain:    'Alla matchande vikarier kontaktas samtidigt. Första att acceptera får jobbet.',
      modeCascadeExplain: 'Vikarier kontaktas i ordning (rank). Nästa kontaktas om den förra tackar nej.',

      // Candidates
      candidatesTitle:    'Matchande vikarier · rankade efter pålitlighet',
      perHour:            'kr/h',
      sendOffer:          'Skicka erbjudande',
      assign:             'Tillsätt',
      modeLocked:         'Erbjudande skickat – läget låst',
      schoolDefault:      'Skolans standardläge:',
      schoolModeSaved:    'Sparat',

      // Simulate buttons
      simAccept:          'Simulera: accepterar',
      simDecline:         'Simulera: tackar nej',

      // State pills
      stateContacted:     'Kontaktad · svarar inom 15 min',
      stateQueued:        'I kö',
      stateAccepted:      'Accepterat',
      stateDeclined:      'Tackade nej',
      stateSuperseded:    'Ersatt',
      statePending:       'Ej skickad',

      // Filled panel
      filledLabel:        'Tillsatt:',
      filledWriteBack:    'I skarp version: skrivs tillbaka till Frånvarokollen (cover_assignments) och vikarien får bekräftelse via SMS/e-post.',

      // Pool exhausted
      poolExhausted:      'Alla vikarier i kaskaden har tackats nej. Välj en annan vikarie manuellt eller kontakta dem direkt.',

      // Footer
      footerReset:        'Återställ demo',
      footerCopy:         '© Vikariekollen',

      // Info icon popup
      infoIconTitle:      'Hur fungerar det i produktion?',
      infoIconBody:       'I skarp version tappar vikarien en länk via SMS (46elks) eller e-post (Resend). Länken innehåller en unik <strong>response_token</strong> som ger dem åtkomst att acceptera eller tacka nej utan att logga in. Svaret triggar sedan RPCn <strong>accept_cover_offer</strong> eller <strong>decline_cover_offer</strong>.',
      infoIconTag:        'Kräver: SMS (46elks) + tokeniserad länk',

      // Modal: send offer
      modalSendTitle:     '⚡ Kräver SMS / e-post',
      modalSendBody:      'I produktion infogas rader i <strong>cover_offer_targets</strong>, varefter edge-funktionen <strong>cover-offer-tick</strong> anropas. Den skickar SMS via <strong>46elks</strong> och/eller e-post via <strong>Resend</strong> till matchande vikarier med en unik svarslänk. Inget av detta är inkopplat ännu.',
      modalSendTag:       'Kräver: 46elks SMS · Resend e-post · cover-offer-tick edge fn',
      modalSendSimulate:  'Simulera utskick',
      modalClose:         'Stäng',

      // Modal: new gap
      modalNewGapTitle:   '⚡ Kräver live-flöde från Frånvarokollen',
      modalNewGapBody:    'I produktion strömmar luckor in automatiskt från Frånvarokollens frånvarolog (<strong>absence_periods</strong> + <strong>cover_records</strong>). En ny rad skapas i <strong>cover_offers</strong> när en lärare markeras frånvarande. Den manuella "Nytt erbjudande"-knappen används bara som nödventil. Det live-flödet är inte inkopplat ännu.',
      modalNewGapTag:     'Kräver: Frånvarokollen absence feed',
      modalNewGapSim:     'Simulera ny lucka',

      // Modal: sub link info
      modalLinkTitle:     '⚡ Kräver vikaries svarslänk (SMS)',
      modalLinkBody:      'I produktion svarar vikarien genom att trycka på en länk i sitt SMS eller e-post — de loggar aldrig in i portalen. Länken är tokeniserad med ett unikt <strong>response_token</strong> per <strong>cover_offer_targets</strong>-rad. Här simuleras svaret manuellt av koordinatorn.',
      modalLinkTag:       'Kräver: tokeniserad SMS-länk (46elks)',
      modalLinkSim:       'Förstått',
    },

    en: {
      // Auth
      signInTitle:        'Sign in',
      emailLabel:         'Email',
      codeLabel:          'Access code',
      signInBtn:          'Sign in',
      demoHint:           'Demo — any credentials work',
      logout:             'Log out',

      // Banner
      demoBanner:         'Demo — no real substitutes are contacted. Everything is simulated.',

      // Stats
      statOpenGaps:       'Open gaps',
      statOffersOut:      'Offers out',
      statFilledToday:    'Filled today',
      statSubsAvail:      'Subs available',

      // Board
      lapsSection:        'Gaps to fill',
      newOfferBtn:        'New offer',
      absent:             'absent',

      // Gap status badges
      badgeOpenUnsent:    'Open · not sent',
      badgeCascade:       'Cascade active',
      badgeOpenPool:      'Open pool',
      badgeFilled:        'Filled',

      // Mode control
      modeAdminAssign:    'Admin assigns',
      modeOpenPool:       'Open pool',
      modeCascade:        'Cascade',

      // Mode explainers
      modeAdminExplain:   'You pick the substitute directly. No SMS is sent.',
      modePoolExplain:    'All matching subs contacted at once. First to accept gets the job.',
      modeCascadeExplain: 'Subs contacted in ranked order. Next is contacted if the previous declines.',

      // Candidates
      candidatesTitle:    'Matching subs · ranked by reliability',
      perHour:            'kr/h',
      sendOffer:          'Send offer',
      assign:             'Assign',
      modeLocked:         'Offer sent — mode locked',
      schoolDefault:      'School default mode:',
      schoolModeSaved:    'Saved',

      // Simulate buttons
      simAccept:          'Simulate: accepts',
      simDecline:         'Simulate: declines',

      // State pills
      stateContacted:     'Contacted · awaiting response',
      stateQueued:        'Queued',
      stateAccepted:      'Accepted',
      stateDeclined:      'Declined',
      stateSuperseded:    'Superseded',
      statePending:       'Not sent',

      // Filled panel
      filledLabel:        'Filled by:',
      filledWriteBack:    'In production: writes back to Frånvarokollen (cover_assignments) and the sub receives a confirmation via SMS/email.',

      // Pool exhausted
      poolExhausted:      'All cascade candidates have declined. Assign manually or contact them directly.',

      // Footer
      footerReset:        'Reset demo',
      footerCopy:         '© Vikariekollen',

      // Info icon popup
      infoIconTitle:      'How does this work in production?',
      infoIconBody:       'In production the sub taps a link in an SMS (46elks) or email (Resend). The link contains a unique <strong>response_token</strong> tied to their <strong>cover_offer_targets</strong> row, letting them accept or decline without logging in. The response triggers the <strong>accept_cover_offer</strong> or <strong>decline_cover_offer</strong> RPC.',
      infoIconTag:        'Requires: SMS (46elks) + tokenised link',

      // Modal: send offer
      modalSendTitle:     '⚡ Requires SMS / email',
      modalSendBody:      'In production, rows are inserted into <strong>cover_offer_targets</strong>, then the <strong>cover-offer-tick</strong> edge function is invoked. It sends SMS via <strong>46elks</strong> and/or email via <strong>Resend</strong> to matched subs with a unique response link. None of this is wired up yet.',
      modalSendTag:       'Requires: 46elks SMS · Resend email · cover-offer-tick edge fn',
      modalSendSimulate:  'Simulate send',
      modalClose:         'Close',

      // Modal: new gap
      modalNewGapTitle:   '⚡ Requires live feed from Frånvarokollen',
      modalNewGapBody:    'In production, gaps stream in automatically from Frånvarokollen\'s absence log (<strong>absence_periods</strong> + <strong>cover_records</strong>). A new row is created in <strong>cover_offers</strong> when a teacher is marked absent. This live feed is not yet connected.',
      modalNewGapTag:     'Requires: Frånvarokollen absence feed',
      modalNewGapSim:     'Simulate new gap',

      // Modal: sub link info
      modalLinkTitle:     '⚡ Requires sub\'s response link (SMS)',
      modalLinkBody:      'In production the sub responds by tapping a link in their SMS or email — they never log into the portal. The link is tokenised with a unique <strong>response_token</strong> per <strong>cover_offer_targets</strong> row. Here the coordinator manually simulates the response.',
      modalLinkTag:       'Requires: tokenised SMS link (46elks)',
      modalLinkSim:       'Got it',
    },
  };

  function getLang() {
    return localStorage.getItem(LANG_KEY) || 'sv';
  }

  function setLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
  }

  function t(key) {
    return (i18n[getLang()] || i18n.sv)[key] || key;
  }

  // ----------------------------------------------------------
  // ROOT
  // ----------------------------------------------------------
  const root = document.getElementById('app');

  // ----------------------------------------------------------
  // el() — DOM helper (identical to sibling module)
  // ----------------------------------------------------------
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className')                   node.className = v;
        else if (k.startsWith('on') && typeof v === 'function') node[k] = v;
        else if (k === 'data') {
          for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        }
        else node.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  // ----------------------------------------------------------
  // LOGO SVG (3×3 grid of rounded squares — identical to sibling)
  // ----------------------------------------------------------
  function buildLogoSVG(size) {
    const dim  = size === 'lg' ? 36 : 26;
    const sq   = size === 'lg' ? 9  : 6;
    const gap  = size === 'lg' ? 3  : 2;
    const r    = 2;
    const cols = ['#2563eb', '#60a5fa', '#16223e',
                  '#60a5fa', '#2563eb', '#60a5fa',
                  '#16223e', '#60a5fa', '#2563eb'];

    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width',   dim);
    svg.setAttribute('height',  dim);
    svg.setAttribute('viewBox', `0 0 ${dim} ${dim}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('fvk-logo-squares');

    for (let i = 0; i < 9; i++) {
      const col  = i % 3;
      const row  = Math.floor(i / 3);
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x',      col * (sq + gap));
      rect.setAttribute('y',      row * (sq + gap));
      rect.setAttribute('width',  sq);
      rect.setAttribute('height', sq);
      rect.setAttribute('rx',     r);
      rect.setAttribute('fill',   cols[i]);
      svg.appendChild(rect);
    }
    return svg;
  }

  function buildLogoWordmark() {
    return el('div', { className: 'fvk-wordmark' },
      el('span', { className: 'fvk-wordmark-top' }, 'Vikarie'),
      el('span', { className: 'fvk-wordmark-bot' }, 'Kollen')
    );
  }

  // ----------------------------------------------------------
  // LANG TOGGLE
  // ----------------------------------------------------------
  function buildLangToggle(onToggle) {
    const lang  = getLang();
    const wrap  = el('div', { className: 'lang-toggle' });
    const svBtn = el('button', {
      className: 'lang-btn' + (lang === 'sv' ? ' active' : ''),
      onclick: () => { setLang('sv'); onToggle(); },
    }, 'SV');
    const enBtn = el('button', {
      className: 'lang-btn' + (lang === 'en' ? ' active' : ''),
      onclick: () => { setLang('en'); onToggle(); },
    }, 'EN');
    wrap.appendChild(svBtn);
    wrap.appendChild(enBtn);
    return wrap;
  }

  // ----------------------------------------------------------
  // MODAL
  // ----------------------------------------------------------
  // Single reusable modal. options = { title, body (HTML), tag, buttons: [{label, primary, onClick}] }
  // Body is set as innerHTML — only used for trusted strings defined in i18n above.

  function openModal(options) {
    // Remove any existing modal
    const existing = document.getElementById('vk-modal');
    if (existing) existing.remove();

    const titleEl = el('div', { className: 'modal-title' },
      el('span', { className: 'modal-title-icon' }, ''),
    );
    // title may contain the icon already in text
    titleEl.textContent = options.title;

    const bodyEl = el('div', { className: 'modal-body' });
    bodyEl.innerHTML = options.body; // safe: all strings from our i18n table

    const tagEl = options.tag
      ? el('div', {}, el('span', { className: 'modal-integration-tag' }, '⚡ ' + options.tag))
      : null;

    const footerBtns = (options.buttons || []).map(b => {
      const btn = el('button', {
        className: 'btn ' + (b.primary ? 'btn-primary' : 'btn-ghost-border'),
        onclick: () => {
          overlay.remove();
          if (b.onClick) b.onClick();
        },
      }, b.label);
      return btn;
    });

    const footer = el('div', { className: 'modal-footer' }, ...footerBtns);

    const card = el('div', { className: 'modal-card' },
      titleEl,
      bodyEl,
      ...(tagEl ? [tagEl] : []),
      footer
    );

    const overlay = el('div', { className: 'modal-overlay', id: 'vk-modal' });
    overlay.appendChild(card);

    // Click backdrop to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ----------------------------------------------------------
  // LOGIN VIEW
  // ----------------------------------------------------------
  function renderLogin(errorMsg) {
    root.innerHTML = '';
    document.documentElement.lang = getLang();

    const loginLang = el('div', { className: 'login-lang' },
      buildLangToggle(renderCurrentView)
    );

    const logoWrap = el('div', { className: 'login-logo-wrap' },
      buildLogoSVG('lg'),
      buildLogoWordmark()
    );

    const emailInp = el('input', {
      type: 'email', id: 'login-email', className: 'text-input',
      placeholder: 'koordinator@skola.se', autocomplete: 'email',
    });

    const codeInp = el('input', {
      type: 'text', id: 'login-code', className: 'text-input',
      placeholder: '••••', inputmode: 'numeric', maxlength: '8',
    });
    codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

    const form = el('div', { className: 'login-card' },
      logoWrap,
      el('h1', { className: 'login-title' }, t('signInTitle')),
      ...(errorMsg ? [el('p', { className: 'login-error' }, errorMsg)] : []),
      el('label', { className: 'field-label', for: 'login-email' }, t('emailLabel')),
      emailInp,
      el('label', { className: 'field-label', for: 'login-code' }, t('codeLabel')),
      codeInp,
      el('button', { className: 'btn btn-primary login-btn', onclick: doLogin }, t('signInBtn')),
      el('p', { className: 'login-hint' }, t('demoHint'))
    );

    root.appendChild(loginLang);
    root.appendChild(el('div', { className: 'login-page' }, form));
    document.getElementById('login-email').focus();
  }

  function doLogin() {
    const email  = document.getElementById('login-email').value.trim();
    const code   = document.getElementById('login-code').value.trim();
    const result = Adapter.login(email, code);
    if (result.ok) {
      renderBoard();
    } else {
      renderLogin(result.error || 'Fel vid inloggning');
    }
  }

  // ----------------------------------------------------------
  // BOARD VIEW (main coordinator screen)
  // ----------------------------------------------------------
  function renderBoard() {
    root.innerHTML = '';
    document.documentElement.lang = getLang();
    const user = Adapter.getCurrentUser();

    // -- Site header --
    const header = el('header', { className: 'site-header' },
      el('div', { className: 'fvk-logo' },
        buildLogoSVG('sm'),
        buildLogoWordmark()
      ),
      el('div', { className: 'header-right' },
        buildLangToggle(renderCurrentView),
        el('span', { className: 'user-email' }, user.email),
        el('button', { className: 'btn btn-ghost', onclick: doLogout }, t('logout'))
      )
    );

    // -- Demo banner --
    const banner = el('div', { className: 'demo-banner' },
      el('span', {}, '⚠'),
      el('span', {}, t('demoBanner'))
    );

    // -- Board page --
    const page = el('div', { className: 'board-page' });

    page.appendChild(buildSchoolModeStrip());
    page.appendChild(buildStatsRow());
    page.appendChild(buildGapsSection());
    page.appendChild(buildBoardFooter());

    root.appendChild(header);
    root.appendChild(banner);
    root.appendChild(page);
  }

  // ----------------------------------------------------------
  // SCHOOL DEFAULT MODE STRIP
  // ----------------------------------------------------------
  function buildSchoolModeStrip() {
    const currentMode = Adapter.getSchoolDefaultMode();
    let savedEl = null;

    function makeBtn(mode, labelKey) {
      return el('button', {
        className: 'mode-btn' + (currentMode === mode ? ' active' : ''),
        id: 'school-mode-' + mode,
        onclick() {
          Adapter.setSchoolDefaultMode(mode);
          // update button active states
          ['admin_assign', 'open_pool', 'cascade'].forEach(m => {
            const b = document.getElementById('school-mode-' + m);
            if (b) b.className = 'mode-btn' + (m === mode ? ' active' : '');
          });
          if (savedEl) {
            savedEl.textContent = t('schoolModeSaved');
            setTimeout(() => { if (savedEl) savedEl.textContent = ''; }, 2000);
          }
        },
      }, t(labelKey));
    }

    savedEl = el('span', { className: 'school-mode-saved', id: 'school-mode-saved' }, '');

    const modeControl = el('div', { className: 'mode-control' },
      makeBtn('admin_assign', 'modeAdminAssign'),
      makeBtn('open_pool',    'modeOpenPool'),
      makeBtn('cascade',      'modeCascade')
    );

    return el('div', { className: 'school-mode-strip' },
      el('span', { className: 'school-mode-label' }, t('schoolDefault')),
      modeControl,
      savedEl
    );
  }

  // ----------------------------------------------------------
  // STATS ROW
  // ----------------------------------------------------------
  function buildStatsRow() {
    const stats = Adapter.getStats();
    function statCard(valueKey, labelKey) {
      return el('div', { className: 'stat-card' },
        el('div', { className: 'stat-value' }, String(stats[valueKey])),
        el('div', { className: 'stat-label' }, t(labelKey))
      );
    }
    return el('div', { className: 'stats-row' },
      statCard('openGaps',      'statOpenGaps'),
      statCard('offersOut',     'statOffersOut'),
      statCard('filledToday',   'statFilledToday'),
      statCard('subsAvailable', 'statSubsAvail')
    );
  }

  // ----------------------------------------------------------
  // GAPS SECTION
  // ----------------------------------------------------------
  function buildGapsSection() {
    const section = el('div', { className: 'gaps-section', id: 'gaps-section' });

    const header = el('div', { className: 'gaps-section-header' },
      el('span', { className: 'gaps-section-title' }, t('lapsSection')),
      el('button', {
        className: 'btn btn-primary btn-sm',
        onclick: openNewGapModal,
      }, '+ ' + t('newOfferBtn'))
    );
    section.appendChild(header);

    const gaps = Adapter.getGaps();
    gaps.forEach(gap => {
      section.appendChild(buildGapRow(gap));
    });

    return section;
  }

  // Rebuild just the gaps section in place (after state mutations)
  function refreshGapsSection() {
    const old = document.getElementById('gaps-section');
    if (!old) return;
    old.replaceWith(buildGapsSection());
    // Also refresh stats row
    refreshStatsRow();
  }

  function refreshStatsRow() {
    const stats = Adapter.getStats();
    const labels = ['openGaps','offersOut','filledToday','subsAvailable'];
    labels.forEach((key, i) => {
      const cards = document.querySelectorAll('.stat-card');
      if (cards[i]) {
        const vEl = cards[i].querySelector('.stat-value');
        if (vEl) vEl.textContent = String(stats[key]);
      }
    });
  }

  // ----------------------------------------------------------
  // GAP ROW
  // ----------------------------------------------------------
  function buildGapRow(gap) {
    const isExpanded = expandedGapId === gap.id;
    const isFilled   = gap.status === 'filled';

    const row = el('div', {
      className: 'gap-row' + (isExpanded ? ' expanded' : ''),
      id: 'gap-row-' + gap.id,
    });

    // Main clickable stripe
    const main = el('div', {
      className: 'gap-row-main',
      onclick: isFilled ? null : () => toggleGapRow(gap.id),
    });
    if (!isFilled) main.style.cursor = 'pointer';

    const avatar = el('div', { className: 'initials-avatar' }, gap.teacherInitials);

    const dateFmt = formatDate(gap.date);
    const timeStr = gap.startTime + '–' + gap.endTime;
    const lessons = gap.lessonCount + (getLang() === 'sv' ? ' lekt.' : ' lessons');

    const info = el('div', { className: 'gap-info' },
      el('div', { className: 'gap-teacher' },
        gap.teacherName,
        el('span', { className: 'gap-teacher-sub' }, ' · ' + t('absent'))
      ),
      el('div', { className: 'gap-meta' },
        el('span', {}, gap.subject),
        el('span', { className: 'gap-meta-dot' }, '·'),
        el('span', {}, gap.group),
        el('span', { className: 'gap-meta-dot' }, '·'),
        el('span', {}, dateFmt),
        el('span', { className: 'gap-meta-dot' }, '·'),
        el('span', {}, timeStr),
        el('span', { className: 'gap-meta-dot' }, '·'),
        el('span', {}, lessons)
      )
    );

    const badge = buildStatusBadge(gap);
    const chevron = isFilled ? null : el('span', { className: 'gap-chevron' }, '▾');

    main.appendChild(avatar);
    main.appendChild(info);
    main.appendChild(badge);
    if (chevron) main.appendChild(chevron);

    row.appendChild(main);

    // Expanded offer panel
    if (isExpanded && !isFilled) {
      row.appendChild(buildOfferPanel(gap));
    }
    // Filled gaps show a mini summary in an always-visible strip
    if (isFilled) {
      row.appendChild(buildFilledStrip(gap));
    }

    return row;
  }

  function toggleGapRow(gapId) {
    expandedGapId = (expandedGapId === gapId) ? null : gapId;
    refreshGapsSection();
  }

  // ----------------------------------------------------------
  // STATUS BADGE
  // ----------------------------------------------------------
  function buildStatusBadge(gap) {
    let cls, text;
    switch (gap.status) {
      case 'open_unsent':
        cls  = 'badge-amber';
        text = t('badgeOpenUnsent');
        break;
      case 'cascade':
        cls  = 'badge-blue';
        text = t('badgeCascade');
        break;
      case 'open_pool':
        cls  = 'badge-blue';
        text = t('badgeOpenPool');
        break;
      case 'filled':
        cls  = 'badge-green';
        text = t('badgeFilled') + (gap.filledBySubName ? ' · ' + gap.filledBySubName : '');
        break;
      default:
        cls  = 'badge-muted';
        text = gap.status;
    }
    return el('span', { className: 'status-badge ' + cls }, text);
  }

  // ----------------------------------------------------------
  // FILLED STRIP (shown instead of expand panel for filled gaps)
  // ----------------------------------------------------------
  function buildFilledStrip(gap) {
    return el('div', { style: 'padding:10px 18px 12px;' },
      el('div', { className: 'filled-confirm' },
        el('span', { className: 'filled-confirm-icon' }, '✓'),
        el('div', {},
          el('div', { className: 'filled-confirm-text' }, t('filledLabel') + ' ' + gap.filledBySubName),
          el('div', { className: 'filled-confirm-note' }, t('filledWriteBack'))
        )
      )
    );
  }

  // ----------------------------------------------------------
  // OFFER PANEL (expanded inline)
  // ----------------------------------------------------------
  function buildOfferPanel(gap) {
    const panel = el('div', { className: 'offer-panel' });

    const offerSent = gap.status !== 'open_unsent';

    // Mode segmented control
    const modeControl = el('div', { className: 'mode-control' });
    [
      ['admin_assign', 'modeAdminAssign'],
      ['open_pool',    'modeOpenPool'],
      ['cascade',      'modeCascade'],
    ].forEach(([mode, labelKey]) => {
      const btn = el('button', {
        className: 'mode-btn' + (gap.mode === mode ? ' active' : ''),
        id: 'gap-mode-' + gap.id + '-' + mode,
        disabled: offerSent ? 'true' : null,
        onclick: offerSent ? null : () => {
          gap.mode = mode;
          // update button states in this panel
          ['admin_assign','open_pool','cascade'].forEach(m => {
            const b = document.getElementById('gap-mode-' + gap.id + '-' + m);
            if (b) b.className = 'mode-btn' + (m === mode ? ' active' : '');
          });
          // update explainer
          const expl = document.getElementById('mode-expl-' + gap.id);
          if (expl) expl.textContent = modeExplainerText(mode);
          // update action row
          const ar = document.getElementById('action-row-' + gap.id);
          if (ar) ar.replaceWith(buildActionRow(gap));
        },
      }, t(labelKey));
      modeControl.appendChild(btn);
    });

    const explainer = el('p', {
      className: 'mode-explainer',
      id: 'mode-expl-' + gap.id,
    }, modeExplainerText(gap.mode));

    if (offerSent) {
      const lockedNote = el('span', { className: 'panel-note' }, t('modeLocked'));
      panel.appendChild(el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' },
        modeControl, lockedNote));
    } else {
      panel.appendChild(modeControl);
    }
    panel.appendChild(explainer);

    // Candidates
    panel.appendChild(el('div', { className: 'candidates-title' }, t('candidatesTitle')));

    const candidates = Adapter.getCandidates(gap.id);
    const candidateList = el('div', { className: 'candidate-list', id: 'candidate-list-' + gap.id });
    candidates.forEach(c => {
      candidateList.appendChild(buildCandidateRow(gap, c));
    });
    panel.appendChild(candidateList);

    // Pool exhausted hint (cascade, no more queued after declines)
    if (gap.status === 'cascade') {
      const anyQueued    = candidates.some(c => c.state === 'queued');
      const anyContacted = candidates.some(c => c.state === 'contacted');
      const anyPending   = candidates.some(c => c.state === 'pending');
      if (!anyQueued && !anyContacted && !anyPending) {
        panel.appendChild(el('div', { className: 'pool-exhausted' }, t('poolExhausted')));
      }
    }

    // Action row
    const actionRow = buildActionRow(gap);
    actionRow.id = 'action-row-' + gap.id;
    panel.appendChild(actionRow);

    return panel;
  }

  function modeExplainerText(mode) {
    if (mode === 'admin_assign') return t('modeAdminExplain');
    if (mode === 'open_pool')    return t('modePoolExplain');
    return t('modeCascadeExplain');
  }

  // ----------------------------------------------------------
  // CANDIDATE ROW
  // ----------------------------------------------------------
  function buildCandidateRow(gap, c) {
    const dimmed = c.state === 'superseded' || c.state === 'declined';
    const row = el('div', { className: 'candidate-row' + (dimmed ? ' dimmed' : '') });

    row.appendChild(el('span', { className: 'rank-num' }, String(c.rank)));

    const avatar = el('div', { className: 'initials-avatar sm violet' }, c.initials);
    row.appendChild(avatar);

    const info = el('div', { className: 'candidate-info' },
      el('div', { className: 'candidate-name' }, c.name),
      el('div', { className: 'candidate-meta' }, c.subjects.join(', ') + ' · ' + c.hourlyRate + ' ' + t('perHour'))
    );
    row.appendChild(info);

    const actions = el('div', { className: 'candidate-actions' });

    // State pill
    actions.appendChild(buildStatePill(c.state));

    // Contextual action buttons
    const offerSent = gap.status !== 'open_unsent';

    if (gap.mode === 'admin_assign' && !offerSent) {
      // Admin-assign mode: each candidate gets a "Tillsätt" button
      const assignBtn = el('button', {
        className: 'btn btn-primary btn-sm',
        onclick: (e) => {
          e.stopPropagation();
          Adapter.adminAssign(gap.id, c.subId);
          expandedGapId = null;
          refreshGapsSection();
          showWriteBackConfirm();
        },
      }, t('assign'));
      actions.appendChild(assignBtn);
    }

    if (offerSent && c.state === 'contacted') {
      // Info icon — explains that real responses come from the sub's SMS link
      const infoBtn = el('button', {
        className: 'info-icon-btn',
        title: t('infoIconTitle'),
        onclick: (e) => {
          e.stopPropagation();
          openModal({
            title:   t('modalLinkTitle'),
            body:    t('modalLinkBody'),
            tag:     t('modalLinkTag'),
            buttons: [{ label: t('modalLinkSim'), primary: true, onClick: null }],
          });
        },
      }, 'ⓘ');
      actions.appendChild(infoBtn);

      // Simulate accept / decline
      const simAccBtn = el('button', {
        className: 'btn btn-ghost-border btn-sm',
        onclick: (e) => {
          e.stopPropagation();
          Adapter.simulateResponse(gap.id, c.subId, 'accept');
          expandedGapId = null;
          refreshGapsSection();
          showWriteBackConfirm();
        },
      }, t('simAccept'));
      const simDecBtn = el('button', {
        className: 'btn btn-ghost-border btn-sm',
        onclick: (e) => {
          e.stopPropagation();
          Adapter.simulateResponse(gap.id, c.subId, 'decline');
          refreshGapsSection();
        },
      }, t('simDecline'));
      actions.appendChild(simAccBtn);
      actions.appendChild(simDecBtn);
    }

    row.appendChild(actions);
    return row;
  }

  // ----------------------------------------------------------
  // STATE PILL
  // ----------------------------------------------------------
  function buildStatePill(state) {
    const map = {
      contacted:  ['pill-contacted',  'stateContacted'],
      queued:     ['pill-queued',     'stateQueued'],
      accepted:   ['pill-accepted',   'stateAccepted'],
      declined:   ['pill-declined',   'stateDeclined'],
      superseded: ['pill-superseded', 'stateSuperseded'],
      pending:    ['pill-pending',    'statePending'],
    };
    const [cls, key] = map[state] || ['pill-pending', 'statePending'];
    return el('span', { className: 'state-pill ' + cls }, t(key));
  }

  // ----------------------------------------------------------
  // ACTION ROW (bottom of offer panel)
  // ----------------------------------------------------------
  function buildActionRow(gap) {
    const row = el('div', { className: 'panel-action-row', id: 'action-row-' + gap.id });

    if (gap.status === 'open_unsent') {
      if (gap.mode === 'admin_assign') {
        // No send button for admin_assign — user clicks "Tillsätt" on each candidate row
        row.appendChild(el('span', { className: 'panel-note' }, t('modeAdminExplain')));
      } else {
        // cascade or open_pool — needs SMS/email → popup
        const sendBtn = el('button', {
          className: 'btn btn-primary',
          onclick: () => openSendOfferModal(gap),
        }, t('sendOffer'));
        row.appendChild(sendBtn);
      }
    } else if (gap.status === 'cascade' || gap.status === 'open_pool') {
      // Offer already out — simulate buttons live on candidate rows, no extra button needed here
      row.appendChild(el('span', { className: 'panel-note' },
        getLang() === 'sv'
          ? 'Erbjudande skickat. Simulera svar på vikarierna ovan.'
          : 'Offer sent. Simulate responses on the candidates above.'
      ));
    }

    return row;
  }

  // ----------------------------------------------------------
  // WRITE-BACK CONFIRM (brief floating note after fill)
  // ----------------------------------------------------------
  function showWriteBackConfirm() {
    const note = el('div', {
      id: 'vk-writeback-toast',
      className: 'writeback-note',
      style: 'position:fixed;bottom:24px;right:24px;z-index:200;max-width:340px;padding:10px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);',
    }, t('filledWriteBack'));
    document.body.appendChild(note);
    setTimeout(() => {
      const n = document.getElementById('vk-writeback-toast');
      if (n) n.remove();
    }, 4000);
  }

  // ----------------------------------------------------------
  // MODAL: Send Offer (SMS/email required)
  // ----------------------------------------------------------
  function openSendOfferModal(gap) {
    openModal({
      title: t('modalSendTitle'),
      body:  t('modalSendBody'),
      tag:   t('modalSendTag'),
      buttons: [
        {
          label: t('modalSendSimulate'),
          primary: true,
          onClick: () => {
            Adapter.sendOffer(gap.id);
            refreshGapsSection();
          },
        },
        { label: t('modalClose'), primary: false, onClick: null },
      ],
    });
  }

  // ----------------------------------------------------------
  // MODAL: New Gap (live FVK feed required)
  // ----------------------------------------------------------
  function openNewGapModal() {
    openModal({
      title: t('modalNewGapTitle'),
      body:  t('modalNewGapBody'),
      tag:   t('modalNewGapTag'),
      buttons: [
        {
          label: t('modalNewGapSim'),
          primary: true,
          onClick: () => {
            addSimulatedGap();
            refreshGapsSection();
          },
        },
        { label: t('modalClose'), primary: false, onClick: null },
      ],
    });
  }

  // Add a new mock open gap to the adapter state
  function addSimulatedGap() {
    // Access the internal state via a controlled path — we expose a helper on Adapter
    // for this purpose since app.js must not touch internal adapter state directly.
    const newGapId = 'gap-sim-' + Date.now();
    const subjects = ['Historia','Kemi','Geografi','Musik','Slöjd','Bild'];
    const groups   = ['6A','6B','7B','8A','9B'];
    const teachers = [
      { name: 'Eva Lindén',    initials: 'EL' },
      { name: 'Mikael Ström',  initials: 'MS' },
      { name: 'Petra Holmqvist', initials: 'PH' },
    ];
    const t2 = teachers[Math.floor(Math.random() * teachers.length)];
    const subj = subjects[Math.floor(Math.random() * subjects.length)];
    const grp  = groups[Math.floor(Math.random() * groups.length)];

    const defaultMode = Adapter.getSchoolDefaultMode();

    // We call a thin hook on Adapter to inject the gap
    // (adapter exposes _addSimGap for this purpose)
    if (typeof Adapter._addSimGap === 'function') {
      Adapter._addSimGap({
        id: newGapId,
        teacherName: t2.name,
        teacherInitials: t2.initials,
        subject: subj,
        group: grp,
        date: '2026-06-26',
        startTime: '10:25',
        endTime: '12:10',
        lessonCount: 2,
        status: 'open_unsent',
        mode: defaultMode,
        filledBySubName: null,
      });
    }
  }

  // ----------------------------------------------------------
  // BOARD FOOTER
  // ----------------------------------------------------------
  function buildBoardFooter() {
    return el('div', { className: 'board-footer' },
      el('span', { className: 'footer-copy' }, t('footerCopy')),
      el('button', {
        className: 'btn btn-ghost',
        onclick: () => {
          Adapter.resetDemo();
          expandedGapId = null;
          refreshGapsSection();
          refreshStatsRow();
        },
      }, t('footerReset'))
    );
  }

  // ----------------------------------------------------------
  // DATE FORMAT
  // ----------------------------------------------------------
  function formatDate(iso) {
    const lang = getLang();
    const months = {
      sv: ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'],
      en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    }[lang] || [];
    const [, m, d] = iso.split('-');
    const mi = parseInt(m, 10) - 1;
    return parseInt(d, 10) + ' ' + (months[mi] || m);
  }

  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------
  function doLogout() {
    Adapter.logout();
    expandedGapId = null;
    renderLogin();
  }

  // ----------------------------------------------------------
  // RE-RENDER CURRENT VIEW (used by lang toggle)
  // ----------------------------------------------------------
  function renderCurrentView() {
    const user = Adapter.getCurrentUser();
    if (user) {
      renderBoard();
    } else {
      renderLogin();
    }
  }

  // ----------------------------------------------------------
  // BOOT
  // ----------------------------------------------------------
  function init() {
    const user = Adapter.getCurrentUser();
    if (user) {
      renderBoard();
    } else {
      renderLogin();
    }
  }

  init();

}());
