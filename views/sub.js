// ============================================================
// views/sub.js — Substitute-facing views
//
// Implements:
//   VK.views.subOffers(container, ctx)   — "Mina erbjudanden"
//   VK.views.subBookings(container, ctx) — "Mina pass"
//
// ctx = { Adapter, el, t, fmt, components, user, role, rerender, setTab }
// ctx.user.subId — the logged-in substitute's id
// CSS: views/sub.css
// ============================================================

(function () {
  'use strict';

  const VK = (window.VK = window.VK || {});
  VK.views = VK.views || {};

  // ----------------------------------------------------------
  // Local i18n (SV default; EN fallback)
  // ----------------------------------------------------------
  const LOCAL = {
    sv: {
      greeting:            'Hej',
      greetingSub:         'Här ser du dina aktiva erbjudanden.',
      noOffers:            'Inga erbjudanden just nu.',
      respondBy:           'Svara senast',
      noBookings:          'Inga inbokade pass.',
      acceptBtn:           'Acceptera',
      declineBtn:          'Tacka nej',
      accepted:            'Du är bokad!',
      acceptedNote:        'I produktion bekräftas detta via länken i SMS/e-post.',
      declined:            'Du har tackat nej.',
      queued:              'Du står på tur',
      covers:              'Vikarierar för',
      cost:                'Ersättning',
      lessonPlanOpen:      'Öppna lektionsplan',
      lessonPlanVia:       'via Lektionskollen',
      lessonPlanToast:     'Öppnar lektionsplanen i Lektionskollen (ej kopplad i demon).',
      lessonPlanNone:      'Lektionsplan: kommer via Lektionskollen',
      bookingsTitle:       'Kommande pass',
      bookingsTitlePast:   'Tidigare pass',
      noUpcoming:          'Inga kommande pass.',
      olderLine:           '+ {n} äldre',
      movedOnGroup:        'Tidigare',
      waitTimeLine:        'Erbjudandet låg hos dig i {dur} innan det gick vidare.',
    },
    en: {
      greeting:            'Hi',
      greetingSub:         'Here are your active offers.',
      noOffers:            'No offers right now.',
      respondBy:           'Respond by',
      noBookings:          'No upcoming bookings.',
      acceptBtn:           'Accept',
      declineBtn:          'Decline',
      accepted:            'You are booked!',
      acceptedNote:        'In production this is confirmed via the SMS/e-mail link.',
      declined:            'You have declined.',
      queued:              'You are queued',
      covers:              'Covering for',
      cost:                'Pay',
      lessonPlanOpen:      'Open lesson plan',
      lessonPlanVia:       'via Lektionskollen',
      lessonPlanToast:     'Opening lesson plan in Lektionskollen (not connected in the demo).',
      lessonPlanNone:      'Lesson plan: coming via Lektionskollen',
      bookingsTitle:       'Upcoming bookings',
      bookingsTitlePast:   'Past bookings',
      noUpcoming:          'No upcoming bookings.',
      olderLine:           '+ {n} older',
      movedOnGroup:        'Past',
      waitTimeLine:        'This offer was with you for {dur} before it moved on.',
    },
  };

  function T(key) {
    const lang = VK.lang.get();
    return (LOCAL[lang] || LOCAL.sv)[key] || key;
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  function gapTimeRange(gap) {
    if (!gap) return '';
    return VK.fmt.timeRange(gap.startTime || '', gap.endTime || '');
  }

  function gapDateStr(gap) {
    if (!gap) return '';
    return VK.fmt.date(gap.date || '');
  }

  // ----------------------------------------------------------
  // subOffers — "Mina erbjudanden"
  // ----------------------------------------------------------
  VK.views.subOffers = function subOffers(container, ctx) {
    const { el, fmt, components, user, Adapter, rerender } = ctx;

    // Read the school toggle once — gates the retrospective wait-time line.
    const schoolSettings = Adapter.getSchoolSettings();
    const showWait = !!(schoolSettings && schoolSettings.showSubWaitTime);

    // -- Greeting header --
    const name = (user && user.name) ? user.name.split(' ')[0] : '';
    container.appendChild(
      el('div', { className: 'sub-greeting' },
        el('div', { className: 'sub-greeting-name' }, T('greeting') + (name ? ', ' + name : '') + '!'),
        el('div', { className: 'sub-greeting-sub' }, T('greetingSub'))
      )
    );

    // -- Offers list --
    const offers = Adapter.getOffersForSub(user.subId) || [];

    // Partition: active (pending/contacted/queued) vs moved-on
    const activeOffers  = offers.filter(function (o) { return !o.movedOn; });
    const movedOnOffers = offers.filter(function (o) { return  o.movedOn; });

    if (!activeOffers.length && !movedOnOffers.length) {
      container.appendChild(
        el('div', { className: 'sub-card sub-card-empty' },
          components.emptyState('✉', T('noOffers'))
        )
      );
      return;
    }

    if (!activeOffers.length) {
      container.appendChild(
        el('div', { className: 'sub-card sub-card-empty' },
          components.emptyState('✉', T('noOffers'))
        )
      );
    }

    // ── Active offers ──────────────────────────────────────
    const activeGrid = el('div', { className: 'sub-card-list' });
    container.appendChild(activeGrid);

    activeOffers.forEach(function (offer) {
      const gap = offer.gap || {};
      const state = offer.state || 'pending';
      const isActionable = state === 'contacted' || state === 'pending';
      const isQueued = state === 'queued';

      const cardId = 'offer-card-' + offer.gapId + '-' + offer.subId;

      function renderCard(localState) {
        const existing = document.getElementById(cardId);
        const card = el('div', { className: 'sub-card sub-offer-card', id: cardId });

        // Top row: avatar + info + pill
        const avi = components.avatar(initials(gap.teacherName || ''), {});
        const info = el('div', { className: 'sub-offer-info' },
          el('div', { className: 'sub-offer-title' },
            (gap.subject || '—') + (gap.group ? ' · ' + gap.group : '')
          ),
          el('div', { className: 'sub-offer-meta' },
            el('span', {}, gapDateStr(gap)),
            el('span', { className: 'sub-meta-dot' }, '·'),
            el('span', {}, gapTimeRange(gap))
          ),
          gap.teacherName
            ? el('div', { className: 'sub-offer-teacher' },
                T('covers') + ': ' + gap.teacherName
              )
            : null
        );
        const pill = components.statePill(localState || state);

        card.appendChild(
          el('div', { className: 'sub-offer-top' }, avi, info, pill)
        );

        // Body: accepted / declined / queued / action buttons
        if (localState === 'accepted') {
          card.appendChild(
            el('div', { className: 'sub-offer-success' },
              el('span', { className: 'sub-offer-success-icon' }, '✓'),
              el('div', {},
                el('div', { className: 'sub-offer-success-text' }, T('accepted')),
                el('div', { className: 'sub-offer-success-note' }, T('acceptedNote'))
              )
            )
          );
        } else if (localState === 'declined') {
          card.appendChild(
            el('div', { className: 'sub-offer-declined' }, T('declined'))
          );
        } else if (isQueued) {
          card.appendChild(
            el('div', { className: 'sub-offer-queued' }, T('queued'))
          );
        } else if (isActionable && !localState) {
          // Gentle deadline line — only for cascade offers with a known deadline
          if (offer.stepExpiresAt) {
            const nowMs       = (VK.Adapter && VK.Adapter.now) ? VK.Adapter.now() : Date.now();
            const deadlineStr = VK.fmt.until(offer.stepExpiresAt, nowMs);
            card.appendChild(
              el('div', { className: 'sub-offer-deadline' },
                T('respondBy') + ' ' + deadlineStr
              )
            );
          }

          const acceptBtn = el('button', {
            className: 'btn sub-btn-accept',
            onclick: function () {
              const res = Adapter.subAccept({ gapId: offer.gapId, subId: offer.subId });
              if (res && res.ok) {
                const fresh = document.getElementById(cardId);
                if (fresh) {
                  fresh.replaceWith(renderCard('accepted'));
                }
                rerender();
              }
            },
          }, T('acceptBtn'));

          const declineBtn = el('button', {
            className: 'btn sub-btn-decline',
            onclick: function () {
              const res = Adapter.subDecline({ gapId: offer.gapId, subId: offer.subId });
              if (res && res.ok) {
                const fresh = document.getElementById(cardId);
                if (fresh) {
                  fresh.replaceWith(renderCard('declined'));
                }
                rerender();
              }
            },
          }, T('declineBtn'));

          card.appendChild(
            el('div', { className: 'sub-offer-actions' }, acceptBtn, declineBtn)
          );

          card.appendChild(
            el('div', { className: 'sub-offer-sms-note' }, T('acceptedNote'))
          );
        }

        // Replace in place if re-rendering single card
        if (existing) {
          existing.replaceWith(card);
        }
        return card;
      }

      activeGrid.appendChild(renderCard(null));
    });

    // ── Moved-on offers (past / retrospective) ─────────────
    if (movedOnOffers.length) {
      container.appendChild(
        el('div', { className: 'sub-moved-on-heading' }, T('movedOnGroup'))
      );

      const movedOnGrid = el('div', { className: 'sub-card-list' });
      container.appendChild(movedOnGrid);

      movedOnOffers.forEach(function (offer) {
        const gap = offer.gap || {};

        // Wait-time line: only when flag is on and timestamps are present
        let waitTimeLine = null;
        if (showWait && offer.sentAt && offer.leftAt) {
          const durationMs = Date.parse(offer.leftAt) - Date.parse(offer.sentAt);
          if (durationMs > 0) {
            const durStr = VK.fmt.dur(durationMs);
            const template = T('waitTimeLine');
            const lineText = template.replace('{dur}', durStr);
            waitTimeLine = el('div', { className: 'sub-offer-wait-time' }, lineText);
          }
        }

        const card = el('div', { className: 'sub-card sub-offer-card sub-offer-card--moved-on' },
          el('div', { className: 'sub-offer-top' },
            components.avatar(initials(gap.teacherName || ''), {}),
            el('div', { className: 'sub-offer-info' },
              el('div', { className: 'sub-offer-title' },
                (gap.subject || '—') + (gap.group ? ' · ' + gap.group : '')
              ),
              el('div', { className: 'sub-offer-meta' },
                el('span', {}, gapDateStr(gap)),
                el('span', { className: 'sub-meta-dot' }, '·'),
                el('span', {}, gapTimeRange(gap))
              ),
              gap.teacherName
                ? el('div', { className: 'sub-offer-teacher' },
                    T('covers') + ': ' + gap.teacherName
                  )
                : null
            ),
            components.statePill(offer.state || 'moved_on')
          ),
          waitTimeLine
        );

        movedOnGrid.appendChild(card);
      });
    }
  };

  // ----------------------------------------------------------
  // subBookings — "Mina pass"
  // ----------------------------------------------------------
  VK.views.subBookings = function subBookings(container, ctx) {
    const { el, fmt, components, user, Adapter } = ctx; // eslint-disable-line no-unused-vars

    const bookings = Adapter.getBookingsForSub(user.subId) || [];

    if (!bookings.length) {
      container.appendChild(
        el('div', { className: 'sub-card sub-card-empty' },
          components.emptyState('📅', T('noBookings'))
        )
      );
      return;
    }

    // "today" from the simulated clock — compare by date string (YYYY-MM-DD)
    const todayStr = (function () {
      const d = new Date(VK.Adapter.now());
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }());

    function bookingDate(b) { return b.date || (b.gap && b.gap.date) || ''; }

    const upcoming = bookings.filter(function (b) { return bookingDate(b) >= todayStr; });
    const past     = bookings.filter(function (b) { return bookingDate(b) <  todayStr; });

    // Sort upcoming ASC, past DESC
    function cmpAsc(a, b) {
      const d = bookingDate(a).localeCompare(bookingDate(b));
      if (d !== 0) return d;
      return ((a.gap && a.gap.startTime) || '').localeCompare((b.gap && b.gap.startTime) || '');
    }
    upcoming.sort(cmpAsc);
    past.sort(function (a, b) { return -cmpAsc(a, b); });

    // ── Helper: render one booking card ──────────────────────
    function renderBookingCard(booking, isPast) {
      const gap     = booking.gap || {};
      const date    = booking.date || gap.date || '';
      const subject = booking.subject || gap.subject || '—';
      const group   = gap.group || '';
      const teacher = gap.teacherName || '';
      const cost    = booking.costSek;

      const cardClass = 'sub-card sub-booking-card' + (isPast ? ' sub-booking-card--past' : '');
      const card = el('div', { className: cardClass });

      card.appendChild(
        el('div', { className: 'sub-booking-when' },
          el('span', { className: 'sub-booking-date' }, VK.fmt.date(date)),
          el('span', { className: 'sub-booking-time' },
            VK.fmt.timeRange(gap.startTime || '', gap.endTime || '')
          )
        )
      );

      card.appendChild(
        el('div', { className: 'sub-booking-subject' },
          subject + (group ? ' · ' + group : '')
        )
      );

      if (teacher) {
        card.appendChild(
          el('div', { className: 'sub-booking-teacher' },
            T('covers') + ': ' + teacher
          )
        );
      }

      if (cost != null && Number(cost) > 0) {
        card.appendChild(
          el('div', { className: 'sub-booking-cost' },
            T('cost') + ': ' + fmt.currency(cost)
          )
        );
      }

      const lessonPlanDiv = buildLessonPlanSection(el, components, booking);
      if (lessonPlanDiv) card.appendChild(lessonPlanDiv);

      return card;
    }

    // ── Upcoming section ──────────────────────────────────────
    container.appendChild(
      el('div', { className: 'sub-section-heading' },
        T('bookingsTitle') + (upcoming.length ? ' (' + upcoming.length + ')' : '')
      )
    );

    if (upcoming.length) {
      const upcomingGrid = el('div', { className: 'sub-card-list' });
      container.appendChild(upcomingGrid);
      upcoming.forEach(function (b) {
        upcomingGrid.appendChild(renderBookingCard(b, false));
      });
    } else {
      container.appendChild(
        el('div', { className: 'sub-section-empty' }, T('noUpcoming'))
      );
    }

    // ── Past section (only when there are past bookings) ──────
    const PAST_VISIBLE = 5;
    if (past.length) {
      container.appendChild(
        el('div', { className: 'sub-section-heading sub-section-heading--past' },
          T('bookingsTitlePast') + ' (' + past.length + ')'
        )
      );

      const pastGrid = el('div', { className: 'sub-card-list' });
      container.appendChild(pastGrid);
      const visible = past.slice(0, PAST_VISIBLE);
      visible.forEach(function (b) {
        pastGrid.appendChild(renderBookingCard(b, true));
      });

      if (past.length > PAST_VISIBLE) {
        const extra = past.length - PAST_VISIBLE;
        container.appendChild(
          el('div', { className: 'sub-older-line' },
            T('olderLine').replace('{n}', extra)
          )
        );
      }
    }
  };

  // ----------------------------------------------------------
  // subAvailability — "Min tillgänglighet"
  // ----------------------------------------------------------
  const AVAIL_LOCAL = {
    sv: {
      introLine:      'Din tillgänglighet styr vilka pass du kan erbjudas — håll den uppdaterad.',
      standardTab:    'Standardvecka',
      weeklyTab:      'Veckovis',
      saveDef:        'Spara',
      saveWeek:       'Spara',
      saved:          'Sparat ✓',
      unsaved:        'Osparade ändringar',
      followsDefault: 'Följer standardvecka',
      customised:     'Anpassad vecka',
      awayAllWeek:    'Borta hela veckan',
      resetToDefault: 'Återställ till standard',
      legendAvail:    'Tillgänglig',
      legendUnavail:  'Ej tillgänglig',
      instruction:    'Tryck/klicka för att markera tillgänglighet',
      weekWord:       'Vecka',
    },
    en: {
      introLine:      'Your availability controls which shifts you can be offered — keep it up to date.',
      standardTab:    'Default week',
      weeklyTab:      'Weekly',
      saveDef:        'Save',
      saveWeek:       'Save',
      saved:          'Saved ✓',
      unsaved:        'Unsaved changes',
      followsDefault: 'Following default week',
      customised:     'Customised week',
      awayAllWeek:    'Away all week',
      resetToDefault: 'Reset to default',
      legendAvail:    'Available',
      legendUnavail:  'Not available',
      instruction:    'Tap/click to mark availability',
      weekWord:       'Week',
    },
  };

  function TA(key) {
    const lang = VK.lang.get();
    return (AVAIL_LOCAL[lang] || AVAIL_LOCAL.sv)[key] || key;
  }

  const AVAIL_DAY_NAMES = {
    sv: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  };

  const AVAIL_MONTH_NAMES = {
    sv: ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'],
    en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  };

  VK.views.subAvailability = function subAvailability(container, ctx) {
    const { el, components, user } = ctx;
    const Adapter = window.VK.Adapter;
    const subId = user && user.subId;

    // Shared drag-paint state
    let isPainting = false;
    let paintValue = true;
    document.addEventListener('mouseup', function () { isPainting = false; }, { passive: true });

    // Sub-tab state: 'standard' | 'weekly'
    let subTab = 'standard';
    let currentWeekId = Adapter.getWeekId(new Date());

    // ----------------------------------------------------------
    // Root render
    // ----------------------------------------------------------
    function render() {
      container.innerHTML = '';

      const wrap = el('div', { className: 'subavail-wrap' });

      // Intro line
      wrap.appendChild(
        el('p', { className: 'subavail-intro' }, TA('introLine'))
      );

      // Segmented control: Standardvecka / Veckovis
      const seg = components.segmentedControl(
        [
          { value: 'standard', label: TA('standardTab') },
          { value: 'weekly',   label: TA('weeklyTab') },
        ],
        subTab,
        function (v) { subTab = v; render(); },
        { className: 'subavail-seg' }
      );
      wrap.appendChild(seg);

      // Tab content
      const tabContent = subTab === 'standard'
        ? renderStandardTab()
        : renderWeeklyTab();
      wrap.appendChild(tabContent);

      container.appendChild(wrap);
    }

    // ----------------------------------------------------------
    // Standard week tab
    // ----------------------------------------------------------
    function renderStandardTab() {
      const schedule     = Adapter.getSchedule();
      const selectedSlots = new Set(Adapter.getDefaultAvailability(subId));

      const statusEl = el('span', { className: 'subavail-status' }, '');

      function markDirty() {
        statusEl.textContent = TA('unsaved');
        statusEl.className   = 'subavail-status subavail-status-unsaved';
      }

      const grid     = buildGrid('subavail-def-grid', schedule, selectedSlots, markDirty);
      const guide    = buildGuide();
      const gridWrap = el('div', { className: 'subavail-grid-wrap' }, grid);

      const saveBtn = el('button', {
        className: 'btn btn-primary subavail-save-btn',
        onclick: function () {
          const res = Adapter.saveDefaultAvailability(subId, Array.from(selectedSlots));
          if (res && res.ok !== false) {
            statusEl.textContent = TA('saved');
            statusEl.className   = 'subavail-status subavail-status-saved';
            setTimeout(function () {
              if (statusEl.textContent === TA('saved')) {
                statusEl.textContent = '';
                statusEl.className   = 'subavail-status';
              }
            }, 3000);
            components.confirmToast(TA('saved'), 'green');
          }
        },
      }, TA('saveDef'));

      const footer = el('div', { className: 'subavail-footer' },
        statusEl,
        saveBtn
      );

      return el('div', { className: 'subavail-tab-panel' }, guide, gridWrap, footer);
    }

    // ----------------------------------------------------------
    // Weekly override tab
    // ----------------------------------------------------------
    function renderWeeklyTab() {
      const schedule      = Adapter.getSchedule();
      let effective       = Adapter.getEffectiveAvailability(subId, currentWeekId);
      let selectedSlots   = new Set(effective.slots);
      let weekSource      = effective.source;

      function buildWeekLabel(weekId) {
        const meta   = Adapter.getWeekMeta(weekId);
        const lang   = VK.lang.get();
        const months = AVAIL_MONTH_NAMES[lang] || AVAIL_MONTH_NAMES.sv;
        const d1 = meta.monday.getUTCDate();
        const d2 = meta.friday.getUTCDate();
        const m1 = months[meta.monday.getUTCMonth()];
        const m2 = months[meta.friday.getUTCMonth()];
        const range = m1 === m2
          ? (d1 + '–' + d2 + ' ' + m1)
          : (d1 + ' ' + m1 + '–' + d2 + ' ' + m2);
        return TA('weekWord') + ' ' + meta.weekNumber + ' · ' + range;
      }

      const weekLabelEl = el('span', { className: 'subavail-week-label' }, buildWeekLabel(currentWeekId));
      const badgeEl     = el('span', { className: 'subavail-week-badge' }, '');
      const statusEl    = el('span', { className: 'subavail-status' }, '');

      function updateBadge() {
        const isOverride = weekSource === 'override';
        const slotsEmpty = isOverride && selectedSlots.size === 0;
        let label, cls;
        if (slotsEmpty) {
          label = TA('awayAllWeek');
          cls   = 'subavail-week-badge badge-away';
        } else if (isOverride) {
          label = TA('customised');
          cls   = 'subavail-week-badge badge-customised';
        } else {
          label = TA('followsDefault');
          cls   = 'subavail-week-badge badge-default';
        }
        badgeEl.textContent = label;
        badgeEl.className   = cls;
      }

      const resetBtn = el('button', {
        className: 'btn btn-ghost-border btn-sm subavail-reset-btn',
        style: 'display:none',
        onclick: function () {
          Adapter.clearWeekOverride(subId, currentWeekId);
          loadWeek(currentWeekId);
        },
      }, TA('resetToDefault'));

      function updateResetVisibility() {
        resetBtn.style.display = Adapter.hasWeekOverride(subId, currentWeekId) ? '' : 'none';
      }

      const grid     = buildGrid('subavail-wk-grid', schedule, selectedSlots, function () {
        statusEl.textContent = TA('unsaved');
        statusEl.className   = 'subavail-status subavail-status-unsaved';
      });
      const guide    = buildGuide();
      const gridWrap = el('div', { className: 'subavail-grid-wrap' }, grid);

      const saveBtn = el('button', {
        className: 'btn btn-primary subavail-save-btn',
        onclick: function () {
          Adapter.saveWeekOverride(subId, currentWeekId, Array.from(selectedSlots));
          weekSource = 'override';
          statusEl.textContent = TA('saved');
          statusEl.className   = 'subavail-status subavail-status-saved';
          setTimeout(function () {
            if (statusEl.textContent === TA('saved')) {
              statusEl.textContent = '';
              statusEl.className   = 'subavail-status';
            }
          }, 3000);
          components.confirmToast(TA('saved'), 'green');
          updateBadge();
          updateResetVisibility();
        },
      }, TA('saveWeek'));

      function loadWeek(weekId) {
        currentWeekId = weekId;
        weekLabelEl.textContent = buildWeekLabel(weekId);
        effective    = Adapter.getEffectiveAvailability(subId, weekId);
        weekSource   = effective.source;
        selectedSlots.clear();
        effective.slots.forEach(function (k) { selectedSlots.add(k); });
        syncGrid('subavail-wk-grid', selectedSlots);
        statusEl.textContent = '';
        statusEl.className   = 'subavail-status';
        updateBadge();
        updateResetVisibility();
      }

      function changeWeek(delta) {
        const meta    = Adapter.getWeekMeta(currentWeekId);
        const newDate = new Date(meta.monday);
        newDate.setUTCDate(meta.monday.getUTCDate() + delta * 7);
        loadWeek(Adapter.getWeekId(newDate));
      }

      const prevBtn = el('button', {
        className: 'btn btn-ghost btn-sm subavail-nav-btn',
        onclick: function () { changeWeek(-1); },
      }, '◀');
      const nextBtn = el('button', {
        className: 'btn btn-ghost btn-sm subavail-nav-btn',
        onclick: function () { changeWeek(1); },
      }, '▶');

      const weekNav  = el('div', { className: 'subavail-week-nav' }, prevBtn, weekLabelEl, nextBtn);
      const navRow   = el('div', { className: 'subavail-nav-badge-row' }, weekNav, badgeEl);

      const footer = el('div', { className: 'subavail-footer' },
        el('div', {}, resetBtn),
        el('div', { className: 'subavail-footer-right' }, statusEl, saveBtn)
      );

      // Boot
      updateBadge();
      updateResetVisibility();

      return el('div', { className: 'subavail-tab-panel' }, navRow, guide, gridWrap, footer);
    }

    // ----------------------------------------------------------
    // Grid builder — click + drag paint, touch tap
    // ----------------------------------------------------------
    function buildGrid(gridId, schedule, selectedSlots, onPaint) {
      const lang     = VK.lang.get();
      const dayNames = AVAIL_DAY_NAMES[lang] || AVAIL_DAY_NAMES.sv;
      const table    = el('table', { className: 'subavail-grid', id: gridId });
      const thead    = el('thead', {});
      const headerRow = el('tr', {});

      headerRow.appendChild(el('th', { className: 'subavail-corner' }, ''));
      schedule.days.forEach(function (_d, dayIndex) {
        headerRow.appendChild(el('th', { className: 'subavail-day-header' }, dayNames[dayIndex] || _d));
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = el('tbody', {});
      for (const hour of schedule.hours) {
        const row = el('tr', {});
        row.appendChild(
          el('td', { className: 'subavail-hour-label' },
            String(hour).padStart(2, '0') + ':00'
          )
        );
        schedule.days.forEach(function (_d, dayIndex) {
          const key = dayIndex + '-' + hour;
          const td  = el('td', {
            className: 'subavail-slot' + (selectedSlots.has(key) ? ' available' : ''),
            data: { key: key },
          });

          // Mouse: drag-paint
          td.addEventListener('mousedown', function (e) {
            e.preventDefault();
            isPainting = true;
            paintValue = !selectedSlots.has(key);
            applyCell(td, key, selectedSlots, onPaint);
          });
          td.addEventListener('mouseenter', function () {
            if (isPainting) applyCell(td, key, selectedSlots, onPaint);
          });

          // Touch: single tap toggle (no drag needed on phone)
          td.addEventListener('touchend', function (e) {
            e.preventDefault();
            paintValue = !selectedSlots.has(key);
            applyCell(td, key, selectedSlots, onPaint);
          });

          row.appendChild(td);
        });
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      return table;
    }

    function applyCell(cell, key, selectedSlots, onPaint) {
      if (paintValue) {
        selectedSlots.add(key);
        cell.classList.add('available');
      } else {
        selectedSlots.delete(key);
        cell.classList.remove('available');
      }
      onPaint(key, paintValue);
    }

    function syncGrid(gridId, selectedSlots) {
      const cells = document.querySelectorAll('#' + gridId + ' .subavail-slot');
      cells.forEach(function (cell) {
        cell.classList.toggle('available', selectedSlots.has(cell.dataset.key));
      });
    }

    // ----------------------------------------------------------
    // Legend + instruction line
    // ----------------------------------------------------------
    function buildGuide() {
      return el('div', { className: 'subavail-guide' },
        el('span', { className: 'subavail-instruction' }, TA('instruction')),
        el('div', { className: 'subavail-legend' },
          el('span', { className: 'subavail-legend-item' },
            el('span', { className: 'subavail-swatch subavail-swatch-avail' }),
            TA('legendAvail')
          ),
          el('span', { className: 'subavail-legend-item' },
            el('span', { className: 'subavail-swatch subavail-swatch-unavail' }),
            TA('legendUnavail')
          )
        )
      );
    }

    // ----------------------------------------------------------
    // Boot
    // ----------------------------------------------------------
    render();
  };

  // ----------------------------------------------------------
  // Lesson plan widget (used by subBookings)
  // booking.lessonPlan → { title, url, source:'Lektionskollen' } | null
  // ----------------------------------------------------------
  function buildLessonPlanSection(el, components, booking) {
    const plan = booking && booking.lessonPlan;
    const wrap = el('div', { className: 'sub-lesson-plan' });

    if (plan) {
      const openBtn = el('button', {
        className: 'btn sub-lesson-plan__open',
        onclick: function () {
          components.confirmToast(T('lessonPlanToast'), 'blue');
        },
      }, T('lessonPlanOpen'));

      wrap.appendChild(
        el('div', { className: 'sub-lesson-plan__row' },
          el('span', { className: 'sub-lesson-plan__icon' }, '📄'),
          el('div', { className: 'sub-lesson-plan__body' },
            el('span', { className: 'sub-lesson-plan__title' }, plan.title),
            el('span', { className: 'sub-lesson-plan__source' }, T('lessonPlanVia')),
            el('span', { className: 'sub-lesson-plan__url' }, plan.url)
          ),
          openBtn
        )
      );
    } else {
      wrap.appendChild(
        el('div', { className: 'sub-lesson-plan__none' }, T('lessonPlanNone'))
      );
    }

    return wrap;
  }

}());
