// ============================================================
// views/board.js — Coordinator "Tavla" (board) view
// ============================================================

(function () {
  'use strict';
  const VK = (window.VK = window.VK || {});
  VK.views = VK.views || {};

  // ----------------------------------------------------------
  // LOCAL I18N (SV default; EN optional)
  // ----------------------------------------------------------
  // Pool badge labels and variants — keyed by tier, own strings (SV/EN).
  const POOL_BADGE = {
    sv: {
      internal_staff: { label: 'Intern personal', variant: 'navy'  },
      fvk_active:     { label: 'Aktiv FVK',       variant: 'green' },
      vk_subs:        { label: 'VK',              variant: 'blue'  },
      fvk_inactive:   { label: 'Inaktiv FVK',     variant: 'muted' },
    },
    en: {
      internal_staff: { label: 'Internal staff',  variant: 'navy'  },
      fvk_active:     { label: 'Active FVK',      variant: 'green' },
      vk_subs:        { label: 'VK',              variant: 'blue'  },
      fvk_inactive:   { label: 'Inactive FVK',    variant: 'muted' },
    },
  };

  function poolBadge(tier) {
    const map = POOL_BADGE[VK.lang.get()] || POOL_BADGE.sv;
    const def = map[tier] || map['vk_subs'];
    return VK.components.badge(def.label, def.variant);
  }

  const LOCAL = {
    sv: {
      notQualified:        'Ej behörig',
      metricOpenGaps:      'Öppna luckor',
      metricOffersOut:     'Erbjudanden ute',
      metricFilledToday:   'Tillsatta idag',
      metricSubsAvail:     'Vikarier tillgängliga',
      sectionTitle:        'Luckor att fylla',
      newGapBtn:           '+ Nytt erbjudande',
      filterAll:           'Alla',
      filterOpen:          'Öppna',
      filterFilled:        'Tillsatta',
      absent:              'frånvarande',
      noGaps:              'Inga luckor',
      noGapsSub:           'Luckor flödar in automatiskt från Frånvarokollen när lärare anmäler frånvaro.',
      // offer panel
      modeLabel:           'Tillsättningsläge',
      modeLocked:          'Erbjudande skickat – läget låst',
      explainAdminAssign:  'Du väljer direkt vem som ska ta passet utan att skicka erbjudande.',
      explainOpenPool:     'Erbjudandet skickas till alla tillgängliga vikarier samtidigt – den som accepterar först får passet.',
      explainCascade:      'Erbjudandena skickas en i taget i rankningsordning – näste kontaktas om den förste tackar nej eller inte svarar i tid.',
      candidatesTitle:     'Matchade vikarier',
      noCandidates:        'Inga matchade vikarier tillgängliga',
      reliability:         'Pålitlighet',
      conflict:            'Krockar',
      busy:                'Upptagen',
      sourceInternal:      'Intern',
      sourceExternal:      'Extern',
      sendOfferBtn:        'Skicka erbjudande',
      assignBtn:           'Tillsätt',
      simAccept:           'Simulera: accepterar',
      simDecline:          'Simulera: tackar nej',
      cancelOffer:         'Avbryt erbjudande',
      cancelConfirm:       'Erbjudandet har avbrutits.',
      assignConfirm:       'Vikarie tillsatt. I skarp version: skrivs tillbaka till Frånvarokollen (cover_assignments) och vikarien bekräftas via SMS/e-post.',
      filledBy:            'Tillsatt:',
      filledNote:          'I skarp version: skrivs tillbaka till Frånvarokollen (cover_assignments) och vikarien får bekräftelse via SMS/e-post.',
      infoBtn:             'ⓘ',
      advanceHint:         '⏩ Spola tid',
      simResponseInfo:     'Riktiga svar kommer via vikariens personliga svars-länk i SMS (tokenbaserad). "Spola tid"-knappen i sidfoten avancerar kaskad-timern.',
      cascadeAtTable:      'Hos vikarien sedan',
      cascadeRespondBy:    '· svarar senast',
      pushToNext:          'Skicka vidare',
      pushToNextTitle:     'Skicka vidare till nästa vikarie i kaskaden',
      pushAdvanced:        'Gick vidare till nästa vikarie',
      pushExhausted:       'Inga fler kandidater — kaskaden är slut',
      // modal – new gap
      newGapModalTitle:    'Simulera ny lucka',
      newGapModalBody:     'I produktion flödar luckor in automatiskt från Frånvarokollen när lärare registrerar frånvaro. Fyll i nedan för att lägga till en testlucka manuellt.',
      newGapTeacher:       'Lärarens namn',
      newGapSubject:       'Ämne',
      newGapGroup:         'Grupp/klass',
      newGapDate:          'Datum',
      newGapStart:         'Starttid',
      newGapEnd:           'Sluttid',
      newGapSimBtn:        'Simulera ny lucka',
      newGapErrTeacher:    'Ange lärarens namn.',
      newGapErrDate:       'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).',
      newGapErrTime:       'Sluttid måste vara efter starttid.',
      // modal – send offer
      sendModalTitle:      'Skicka erbjudande',
      sendModalBody:       'I produktion skickas erbjudanden via <strong>GatewayAPI SMS</strong> och <strong>Resend e-post</strong> med en unik svars-länk. SMS/e-post-kanalen är inte kopplad i denna demo.',
      sendModalTag:        'Kräver SMS/e-post',
      sendModalConfirm:    'Simulera utskick',
    },
    en: {
      notQualified:        'Not qualified',
      metricOpenGaps:      'Open gaps',
      metricOffersOut:     'Offers out',
      metricFilledToday:   'Filled today',
      metricSubsAvail:     'Substitutes available',
      sectionTitle:        'Gaps to fill',
      newGapBtn:           '+ New offer',
      filterAll:           'All',
      filterOpen:          'Open',
      filterFilled:        'Filled',
      absent:              'absent',
      noGaps:              'No gaps',
      noGapsSub:           'Gaps stream in automatically from Frånvarokollen when teachers register absences.',
      modeLabel:           'Assignment mode',
      modeLocked:          'Offer sent – mode is locked',
      explainAdminAssign:  'You directly pick who covers the lesson, no offer is sent.',
      explainOpenPool:     'The offer is sent to all available substitutes at once – whoever accepts first gets the slot.',
      explainCascade:      'Offers are sent one at a time in ranked order – the next is contacted if the previous declines or doesn’t respond in time.',
      candidatesTitle:     'Matched substitutes',
      noCandidates:        'No matched substitutes available',
      reliability:         'Reliability',
      conflict:            'Conflict',
      busy:                'Busy',
      sourceInternal:      'Internal',
      sourceExternal:      'External',
      sendOfferBtn:        'Send offer',
      assignBtn:           'Assign',
      simAccept:           'Simulate: accepts',
      simDecline:          'Simulate: declines',
      cancelOffer:         'Cancel offer',
      cancelConfirm:       'Offer has been cancelled.',
      assignConfirm:       'Substitute assigned. In production: written back to Frånvarokollen (cover_assignments) and the substitute receives confirmation via SMS/email.',
      filledBy:            'Filled:',
      filledNote:          'In production: written back to Frånvarokollen (cover_assignments) and the substitute receives confirmation via SMS/email.',
      infoBtn:             'ⓘ',
      advanceHint:         '⏩ Advance time',
      simResponseInfo:     'Real responses come via the substitute\'s personal token link in SMS. The "Advance time" button in the footer advances the cascade timer.',
      cascadeAtTable:      'With substitute since',
      cascadeRespondBy:    '· respond by',
      pushToNext:          'Push to next',
      pushToNextTitle:     'Push to the next substitute in the cascade',
      pushAdvanced:        'Advanced to next substitute',
      pushExhausted:       'No more candidates — the cascade is exhausted',
      newGapModalTitle:    'Simulate new gap',
      newGapModalBody:     'In production, gaps stream in automatically from Frånvarokollen when teachers register absences. Fill in below to add a demo gap manually.',
      newGapTeacher:       'Teacher name',
      newGapSubject:       'Subject',
      newGapGroup:         'Group/class',
      newGapDate:          'Date',
      newGapStart:         'Start time',
      newGapEnd:           'End time',
      newGapSimBtn:        'Simulate gap',
      newGapErrTeacher:    'Enter the teacher\'s name.',
      newGapErrDate:       'Enter a valid date (YYYY-MM-DD).',
      newGapErrTime:       'End time must be after start time.',
      sendModalTitle:      'Send offer',
      sendModalBody:       'In production, offers are sent via <strong>GatewayAPI SMS</strong> and <strong>Resend email</strong> with a unique response link. The SMS/email channel is not connected in this demo.',
      sendModalTag:        'Requires SMS/email',
      sendModalConfirm:    'Simulate send',
    },
  };

  function T(k) {
    return (LOCAL[VK.lang.get()] || LOCAL.sv)[k] || k;
  }

  // ----------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------
  function fieldRow(labelText, inputEl, errorId) {
    const e = VK.el;
    return e('div', { className: 'board-field-row' },
      e('label', { className: 'field-label' }, labelText),
      inputEl,
      errorId ? e('div', { className: 'board-field-error', id: errorId }) : null
    );
  }

  function makeInput(type, placeholder, value, id) {
    const inp = VK.el('input', {
      type: type || 'text',
      className: 'text-input',
      placeholder: placeholder || '',
      value: value || '',
    });
    if (id) inp.id = id;
    return inp;
  }

  // ----------------------------------------------------------
  // MAIN VIEW
  // ----------------------------------------------------------
  VK.views.board = function board(container, ctx) {
    const { el, components, fmt } = ctx;
    const Adapter = window.VK.Adapter;

    // Closure state
    let expandedGapId = null;
    let statusFilter  = 'all'; // 'all' | 'open' | 'filled'

    // ----------------------------------------------------------
    // RENDER
    // ----------------------------------------------------------
    function render() {
      container.innerHTML = '';

      // ---- 1. STATS ROW ----
      const stats = Adapter.getStats();
      const statsRow = el('div', { className: 'stats-row' },
        components.metricCard(T('metricOpenGaps'),    stats.openGaps),
        components.metricCard(T('metricOffersOut'),   stats.offersOut),
        components.metricCard(T('metricFilledToday'), stats.filledToday),
        components.metricCard(T('metricSubsAvail'),   stats.subsAvailable)
      );
      container.appendChild(statsRow);

      // ---- 2. TOP ROW: section title + new gap button ----
      const topRow = el('div', { className: 'board-top-row' },
        el('span', { className: 'board-section-title' }, T('sectionTitle')),
        el('button', { className: 'btn btn-primary btn-sm', onclick: openNewGapModal },
          T('newGapBtn'))
      );
      container.appendChild(topRow);

      // ---- 3. GAPS SECTION ----
      const section = el('div', { className: 'gaps-section' });

      // section header with filter
      const filterControl = components.segmentedControl(
        [
          { value: 'all',    label: T('filterAll') },
          { value: 'open',   label: T('filterOpen') },
          { value: 'filled', label: T('filterFilled') },
        ],
        statusFilter,
        function (v) { statusFilter = v; render(); }
      );
      filterControl.className += ' gaps-filter';

      const sectionHeader = el('div', { className: 'gaps-section-header' },
        filterControl
      );
      section.appendChild(sectionHeader);

      // fetch gaps according to filter
      let gapFilter = undefined;
      if (statusFilter === 'open')   gapFilter = undefined; // filter in JS
      if (statusFilter === 'filled') gapFilter = undefined;
      const allGaps = Adapter.listGaps();
      let gaps = allGaps;
      if (statusFilter === 'open') {
        gaps = allGaps.filter(g =>
          g.status === 'open_unsent' || g.status === 'cascade' || g.status === 'open_pool');
      } else if (statusFilter === 'filled') {
        gaps = allGaps.filter(g => g.status === 'filled' || g.status === 'expired');
      }

      if (gaps.length === 0) {
        section.appendChild(
          components.emptyState('📋', T('noGaps'), T('noGapsSub'))
        );
      } else {
        const gapList = el('div', { className: 'gap-list' });
        gaps.forEach(gap => gapList.appendChild(buildGapRow(gap)));
        section.appendChild(gapList);
      }

      container.appendChild(section);
    }

    // ----------------------------------------------------------
    // GAP ROW
    // ----------------------------------------------------------
    function buildGapRow(gap) {
      const el = VK.el;
      const isExpanded = expandedGapId === gap.id;
      const isClosed   = gap.status === 'filled' || gap.status === 'expired';

      const row = el('div', {
        className: 'gap-row' + (isExpanded ? ' expanded' : '') + (isClosed ? ' closed' : ''),
      });

      // status badge: filled gets sub name suffix
      let badge;
      if (gap.status === 'filled') {
        badge = VK.components.statusBadge('filled', gap.filledBySubName || '');
      } else {
        badge = VK.components.statusBadge(gap.status);
      }

      const chevron = isClosed ? null : el('span', { className: 'gap-chevron' }, '▾');

      const mainRow = el('div', { className: 'gap-row-main' },
        VK.components.avatar(gap.teacherInitials || '?'),
        el('div', { className: 'gap-info' },
          el('div', { className: 'gap-teacher' },
            gap.teacherName,
            el('span', { className: 'gap-teacher-sub' }, ' · ' + T('absent'))
          ),
          el('div', { className: 'gap-meta' },
            el('span', null, gap.subject || '—'),
            el('span', { className: 'gap-meta-dot' }, '·'),
            el('span', null, gap.group || '—'),
            el('span', { className: 'gap-meta-dot' }, '·'),
            el('span', null, fmt.date(gap.date)),
            el('span', { className: 'gap-meta-dot' }, '·'),
            el('span', null, fmt.timeRange(gap.startTime, gap.endTime)),
            el('span', { className: 'gap-meta-dot' }, '·'),
            el('span', null, fmt.int(gap.lessonCount) + ' ' + VK.t('lessons'))
          )
        ),
        badge,
        chevron
      );

      if (!isClosed) {
        mainRow.onclick = function () {
          expandedGapId = expandedGapId === gap.id ? null : gap.id;
          render();
        };
        mainRow.style.cursor = 'pointer';
      }

      row.appendChild(mainRow);

      if (isExpanded && !isClosed) {
        row.appendChild(buildOfferPanel(gap));
      }

      // also allow filled rows to show the filled panel (read-only)
      if (isExpanded && isClosed && gap.status === 'filled') {
        const filledPanel = buildFilledPanel(gap);
        row.appendChild(filledPanel);
        mainRow.style.cursor = 'pointer';
        mainRow.onclick = function () {
          expandedGapId = expandedGapId === gap.id ? null : gap.id;
          render();
        };
      }

      return row;
    }

    // ----------------------------------------------------------
    // OFFER PANEL
    // ----------------------------------------------------------
    function buildOfferPanel(gap) {
      const el = VK.el;
      const Adapter = window.VK.Adapter;
      const settings = Adapter.getSchoolSettings();
      const hasOffer  = (gap.status !== 'open_unsent');
      const modeOpts  = [
        { value: 'admin_assign', label: VK.t('modeAdminAssign') },
        { value: 'open_pool',    label: VK.t('modeOpenPool') },
        { value: 'cascade',      label: VK.t('modeCascade') },
      ];

      const modeExplainKey = gap.mode === 'admin_assign' ? 'explainAdminAssign'
                           : gap.mode === 'open_pool'    ? 'explainOpenPool'
                           :                               'explainCascade';

      const modeControl = VK.components.segmentedControl(
        modeOpts,
        gap.mode,
        function (v) {
          Adapter.updateGap(gap.id, { mode: v });
          render();
        },
        { disabled: hasOffer }
      );

      const modeLockHint = hasOffer
        ? el('div', { className: 'panel-note board-mode-lock' }, T('modeLocked'))
        : null;

      const modeExplainer = el('div', { className: 'mode-explainer' }, T(modeExplainKey));

      // candidates
      const candidates = Adapter.matchCandidates(gap.id);
      let candidateEls;
      if (candidates.length === 0) {
        candidateEls = el('div', { className: 'panel-note' }, T('noCandidates'));
      } else {
        candidateEls = el('div', { className: 'candidate-list' },
          ...candidates.map(c => buildCandidateRow(gap, c, hasOffer))
        );
      }

      // action row (send offer button, or admin-assign instructions)
      const actionRow = buildActionRow(gap, hasOffer, candidates);

      // cancel offer link — shown when offer is out and not filled
      const cancelEl = (gap.status === 'cascade' || gap.status === 'open_pool')
        ? el('div', { className: 'panel-action-row board-cancel-row' },
            el('button', {
              className: 'btn btn-ghost btn-sm board-cancel-link',
              onclick: function () {
                Adapter.cancelOffer(gap.id);
                VK.components.confirmToast(T('cancelConfirm'), 'amber');
                render();
              },
            }, T('cancelOffer'))
          )
        : null;

      // push-to-next button — cascade mode only when an offer is active
      const pushToNextEl = (gap.status === 'cascade' && hasOffer)
        ? el('div', { className: 'panel-action-row board-push-row' },
            el('button', {
              className: 'btn btn-ghost-border btn-sm board-push-btn',
              title: T('pushToNextTitle'),
              onclick: function () {
                const res = Adapter.advanceCascade(gap.id);
                if (res && res.exhausted) {
                  VK.components.confirmToast(T('pushExhausted'), 'amber');
                } else if (res && res.ok) {
                  VK.components.confirmToast(T('pushAdvanced'), 'green');
                }
                render();
              },
            }, '⏭ ' + T('pushToNext'))
          )
        : null;

      return el('div', { className: 'offer-panel' },
        el('div', { className: 'offer-panel-mode-wrap' },
          el('div', { className: 'board-mode-label' }, T('modeLabel')),
          modeControl,
          modeLockHint
        ),
        modeExplainer,
        el('div', { className: 'candidates-title' }, T('candidatesTitle')),
        candidateEls,
        actionRow,
        pushToNextEl,
        cancelEl
      );
    }

    // ----------------------------------------------------------
    // CANDIDATE ROW
    // ----------------------------------------------------------
    function buildCandidateRow(gap, c, hasOffer) {
      const el = VK.el;
      const isDimmed = c.state === 'declined' || c.state === 'superseded';

      const reliabilityBadge = VK.components.badge(
        T('reliability') + ' ' + fmt.int(c.reliabilityScore),
        c.reliabilityScore >= 70 ? 'green' : c.reliabilityScore >= 40 ? 'amber' : 'muted'
      );

      const conflictBadge = c.conflict
        ? VK.components.badge(
            c.conflict === 'booked' ? T('busy') : T('conflict'),
            'violet'
          )
        : null;

      // soft qualification signal — only shown when explicitly false (not absent/undefined)
      const notQualifiedBadge = c.qualified === false
        ? VK.components.badge(T('notQualified'), 'amber')
        : null;

      const stateEl = VK.components.statePill(c.state);

      // per-candidate action buttons
      const actions = [];

      if (!hasOffer && gap.mode === 'admin_assign' && !c.conflict) {
        actions.push(el('button', {
          className: 'btn btn-primary btn-sm',
          onclick: function (e) {
            e.stopPropagation();
            Adapter.adminAssignRecipient(gap.id, c.recipientType, c.recipientId);
            VK.components.confirmToast(T('assignConfirm'), 'green');
            render();
          },
        }, T('assignBtn')));
      }

      // Timing line for the contacted candidate in cascade mode
      let timingLineEl = null;
      if (hasOffer && c.state === 'contacted' && gap.status === 'cascade' && c.sentAt) {
        const nowMs      = Adapter.now ? Adapter.now() : Date.now();
        const atTableMs  = nowMs - Date.parse(c.sentAt);
        const atTableStr = VK.fmt.dur(atTableMs);
        const deadlineStr = c.stepExpiresAt ? VK.fmt.until(c.stepExpiresAt, nowMs) : null;
        const timingText  = T('cascadeAtTable') + ' ' + atTableStr
          + (deadlineStr ? ' ' + T('cascadeRespondBy') + ' ' + deadlineStr : '');
        timingLineEl = el('div', { className: 'cascade-timing-line' }, timingText);
      }

      if (hasOffer && c.state === 'contacted') {
        const infoBtn = el('button', {
          className: 'info-icon-btn',
          title: T('simResponseInfo'),
          onclick: function (e) {
            e.stopPropagation();
            VK.components.modal({
              title: T('infoBtn') + ' Simulerade svar',
              body: T('simResponseInfo'),
            });
          },
        }, T('infoBtn'));

        actions.push(
          el('button', {
            className: 'btn btn-ghost-border btn-sm',
            onclick: function (e) {
              e.stopPropagation();
              Adapter.respond(gap.id, c.recipientType, c.recipientId, 'accept');
              render();
            },
          }, T('simAccept')),
          el('button', {
            className: 'btn btn-ghost btn-sm',
            onclick: function (e) {
              e.stopPropagation();
              Adapter.respond(gap.id, c.recipientType, c.recipientId, 'decline');
              render();
            },
          }, T('simDecline')),
          infoBtn
        );
      }

      const actionsWrap = el('div', { className: 'candidate-actions' },
        stateEl,
        reliabilityBadge,
        conflictBadge,
        notQualifiedBadge,
        ...actions
      );

      return el('div', {
        className: 'candidate-row' + (isDimmed ? ' dimmed' : ''),
      },
        el('span', { className: 'rank-num' }, '#' + c.rank),
        VK.components.avatar(c.initials, { sm: true, violet: true }),
        el('div', { className: 'candidate-info' },
          el('div', { className: 'candidate-name' },
            c.name,
            // pool badge: tier → colored label (subsumes old Intern/Extern tag)
            poolBadge(c.tier)
          ),
          el('div', { className: 'candidate-meta' },
            (c.subjects || []).join(', ') + ' · ' + fmt.int(c.rate) + ' ' + VK.t('perHour')
          ),
          timingLineEl
        ),
        actionsWrap
      );
    }

    // ----------------------------------------------------------
    // ACTION ROW (send offer / info per mode)
    // ----------------------------------------------------------
    function buildActionRow(gap, hasOffer, candidates) {
      const el = VK.el;

      if (gap.status === 'open_unsent' && gap.mode !== 'admin_assign') {
        // Show "Skicka erbjudande" → confirmation modal
        return el('div', { className: 'panel-action-row' },
          el('button', {
            className: 'btn btn-primary btn-sm',
            onclick: function () {
              VK.components.modal({
                title: T('sendModalTitle'),
                body: T('sendModalBody'),
                tag: T('sendModalTag'),
                buttons: [
                  { label: VK.t('cancel') },
                  {
                    label: T('sendModalConfirm'),
                    primary: true,
                    onClick: function () {
                      Adapter.sendOffer(gap.id);
                      render();
                    },
                  },
                ],
              });
            },
          }, T('sendOfferBtn'))
        );
      }

      if (gap.status === 'open_unsent' && gap.mode === 'admin_assign') {
        // No send button; Tillsätt is per-candidate (built above)
        return el('div', { className: 'panel-note' },
          '← ' + T('assignBtn') + '-knappen syns på varje vikarie ovan.'
        );
      }

      return null;
    }

    // ----------------------------------------------------------
    // FILLED PANEL (read-only)
    // ----------------------------------------------------------
    function buildFilledPanel(gap) {
      const el = VK.el;
      return el('div', { className: 'offer-panel' },
        el('div', { className: 'filled-confirm' },
          el('div', { className: 'filled-confirm-icon' }, '✓'),
          el('div', null,
            el('div', { className: 'filled-confirm-text' },
              T('filledBy') + ' ' + (gap.filledBySubName || '—')
            ),
            el('div', { className: 'filled-confirm-note' }, T('filledNote'))
          )
        )
      );
    }

    // ----------------------------------------------------------
    // NEW GAP MODAL
    // ----------------------------------------------------------
    function openNewGapModal() {
      const el = VK.el;

      const inpTeacher  = makeInput('text', 'Anna Lindqvist', '', 'ngap-teacher');
      const inpSubject  = makeInput('text', 'Matematik', '', 'ngap-subject');
      const inpGroup    = makeInput('text', '8B', '', 'ngap-group');
      const inpDate     = makeInput('date', '', '2026-06-24', 'ngap-date');
      const inpStart    = makeInput('time', '', '08:20', 'ngap-start');
      const inpEnd      = makeInput('time', '', '10:05', 'ngap-end');
      const errDiv      = el('div', { className: 'board-field-error', id: 'ngap-err' });

      const body = el('div', { className: 'board-new-gap-form' },
        el('p', { className: 'panel-note board-new-gap-intro' }, T('newGapModalBody')),
        fieldRow(T('newGapTeacher'),  inpTeacher),
        fieldRow(T('newGapSubject'),  inpSubject),
        fieldRow(T('newGapGroup'),    inpGroup),
        fieldRow(T('newGapDate'),     inpDate),
        fieldRow(T('newGapStart'),    inpStart),
        fieldRow(T('newGapEnd'),      inpEnd),
        errDiv
      );

      const closeModal = VK.components.modal({
        title: T('newGapModalTitle'),
        body: body,
        buttons: [
          { label: VK.t('cancel') },
          {
            label: T('newGapSimBtn'),
            primary: true,
            onClick: function () {
              const teacher  = inpTeacher.value.trim();
              const subject  = inpSubject.value.trim();
              const group    = inpGroup.value.trim();
              const date     = inpDate.value.trim();
              const startT   = inpStart.value.trim();
              const endT     = inpEnd.value.trim();

              if (!teacher) { showErr(errDiv, T('newGapErrTeacher')); return false; }
              if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { showErr(errDiv, T('newGapErrDate')); return false; }
              if (startT && endT && startT >= endT) { showErr(errDiv, T('newGapErrTime')); return false; }

              const result = Adapter.createGap({
                teacherName: teacher,
                subject: subject || null,
                group,
                date,
                startTime: startT || '08:00',
                endTime:   endT   || '09:00',
                lessonCount: 2,
              });

              if (result.ok) {
                expandedGapId = result.gap.id;
                render();
              }
              // closeModal already called by the modal's onClick wrapper
            },
          },
        ],
      });
    }

    function showErr(errDiv, msg) {
      errDiv.textContent = msg;
      errDiv.style.display = 'block';
    }

    // ----------------------------------------------------------
    // INITIAL RENDER
    // ----------------------------------------------------------
    render();
  };
}());
