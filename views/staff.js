// ============================================================
// views/staff.js — Internal-staff-facing views
//
// Registers:
//   VK.views.staffRequests(container, ctx) — "Förfrågningar"
//   VK.views.staffCovers(container, ctx)   — "Mina vikariat"
//   VK.views.staffWorkload(container, ctx) — "Min arbetsbörda"
//
// ctx = { Adapter, el, t, fmt, components, user, role, rerender, setTab }
// ctx.user.staffId — the logged-in internal staff member's id (string)
// CSS: views/staff.css
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
      greetingSub:         'Här ser du förfrågningar om vikariat.',
      noRequests:          'Inga förfrågningar just nu.',
      noCovers:            'Inga inbokade pass.',
      acceptBtn:           'Acceptera',
      declineBtn:          'Tacka nej',
      accepted:            'Du täcker passet!',
      acceptedNote:        'I produktion bekräftas detta via notis (SMS/e-post/push).',
      declined:            'Du har tackat nej.',
      queued:              'Du står på tur',
      covers:              'Vikarierar för',
      lessonPlanOpen:      'Öppna lektionsplan',
      lessonPlanVia:       'via Lektionskollen',
      lessonPlanToast:     'Öppnar lektionsplanen i Lektionskollen (ej kopplad i demon).',
      lessonPlanNone:      'Lektionsplan: kommer via Lektionskollen',
      coversTitle:         'Kommande vikariat',
      coversTitlePast:     'Tidigare vikariat',
      noUpcoming:          'Inga kommande vikariat.',
      olderLine:           '+ {n} äldre',
      workloadHeading:     'Din täckningstjänst denna månad',
      workloadNote:        'Skolan fördelar täckningsuppdrag jämnt — den här vyn visar hur mycket du tagit på dig.',
      coversThisMonth:     'Pass denna månad',
      limitLabel:          'Av {limit} möjliga',
      hoursLabel:          'timmar denna månad',
      noWorkload:          'Inga vikariat registrerade denna månad.',
    },
    en: {
      greeting:            'Hi',
      greetingSub:         'Here are your cover requests.',
      noRequests:          'No requests right now.',
      noCovers:            'No upcoming covers.',
      acceptBtn:           'Accept',
      declineBtn:          'Decline',
      accepted:            'You are covering this lesson!',
      acceptedNote:        'In production this is confirmed via SMS/e-mail/push.',
      declined:            'You have declined.',
      queued:              'You are queued',
      covers:              'Covering for',
      lessonPlanOpen:      'Open lesson plan',
      lessonPlanVia:       'via Lektionskollen',
      lessonPlanToast:     'Opening lesson plan in Lektionskollen (not connected in the demo).',
      lessonPlanNone:      'Lesson plan: coming via Lektionskollen',
      coversTitle:         'Upcoming covers',
      coversTitlePast:     'Past covers',
      noUpcoming:          'No upcoming covers.',
      olderLine:           '+ {n} older',
      workloadHeading:     'Your cover load this month',
      workloadNote:        'The school distributes cover fairly — this view shows how much you have taken on.',
      coversThisMonth:     'Covers this month',
      limitLabel:          'Of {limit} allowed',
      hoursLabel:          'hours this month',
      noWorkload:          'No covers recorded this month.',
    },
  };

  function T(key) {
    const lang = VK.lang.get();
    return (LOCAL[lang] || LOCAL.sv)[key] || key;
  }

  // ----------------------------------------------------------
  // Helpers (mirror sub.js)
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
  // Lesson plan section (mirrors sub.js buildLessonPlanSection)
  // cover.lessonPlan → { title, url, source:'Lektionskollen' } | null
  // ----------------------------------------------------------
  function buildLessonPlanSection(el, components, cover) {
    const plan = cover && cover.lessonPlan;
    const wrap = el('div', { className: 'staff-lesson-plan' });

    if (plan) {
      const openBtn = el('button', {
        className: 'btn staff-lesson-plan__open',
        onclick: function () {
          components.confirmToast(T('lessonPlanToast'), 'blue');
        },
      }, T('lessonPlanOpen'));

      wrap.appendChild(
        el('div', { className: 'staff-lesson-plan__row' },
          el('span', { className: 'staff-lesson-plan__icon' }, '📄'),
          el('div', { className: 'staff-lesson-plan__body' },
            el('span', { className: 'staff-lesson-plan__title' }, plan.title),
            el('span', { className: 'staff-lesson-plan__source' }, T('lessonPlanVia')),
            el('span', { className: 'staff-lesson-plan__url' }, plan.url)
          ),
          openBtn
        )
      );
    } else {
      wrap.appendChild(
        el('div', { className: 'staff-lesson-plan__none' }, T('lessonPlanNone'))
      );
    }

    return wrap;
  }

  // ----------------------------------------------------------
  // staffRequests — "Förfrågningar"
  // ----------------------------------------------------------
  VK.views.staffRequests = function staffRequests(container, ctx) {
    const { el, components, user, Adapter, rerender } = ctx;

    // Greeting
    const firstName = (user && user.name) ? user.name.split(' ')[0] : '';
    container.appendChild(
      el('div', { className: 'staff-greeting' },
        el('div', { className: 'staff-greeting-name' },
          T('greeting') + (firstName ? ', ' + firstName : '') + '!'
        ),
        el('div', { className: 'staff-greeting-sub' }, T('greetingSub'))
      )
    );

    const reqs = (user && user.staffId)
      ? (Adapter.getRequestsForStaff(user.staffId) || [])
      : [];

    if (!reqs.length) {
      container.appendChild(
        el('div', { className: 'staff-card staff-card-empty' },
          components.emptyState('🔔', T('noRequests'))
        )
      );
      return;
    }

    const reqGrid = el('div', { className: 'staff-card-list' });
    container.appendChild(reqGrid);

    reqs.forEach(function (req) {
      const gap      = req.gap || {};
      const state    = req.state || 'pending';
      const isActionable = state === 'contacted' || state === 'pending';
      const isQueued     = state === 'queued';
      const cardId   = 'staff-req-' + req.gapId + '-' + (req.recipientId || '');

      function renderCard(localState) {
        const existing = document.getElementById(cardId);
        const card = el('div', { className: 'staff-card staff-req-card', id: cardId });

        // Top row: avatar + info + pill
        const avi  = components.avatar(initials(gap.teacherName || ''), {});
        const info = el('div', { className: 'staff-req-info' },
          el('div', { className: 'staff-req-title' },
            (gap.subject || '—') + (gap.group ? ' · ' + gap.group : '')
          ),
          el('div', { className: 'staff-req-meta' },
            el('span', {}, gapDateStr(gap)),
            el('span', { className: 'staff-meta-dot' }, '·'),
            el('span', {}, gapTimeRange(gap))
          ),
          gap.teacherName
            ? el('div', { className: 'staff-req-teacher' },
                T('covers') + ': ' + gap.teacherName
              )
            : null
        );
        const pill = components.statePill(localState || state);

        card.appendChild(
          el('div', { className: 'staff-req-top' }, avi, info, pill)
        );

        // Body: accepted / declined / queued / action buttons
        if (localState === 'accepted') {
          card.appendChild(
            el('div', { className: 'staff-req-success' },
              el('span', { className: 'staff-req-success-icon' }, '✓'),
              el('div', {},
                el('div', { className: 'staff-req-success-text' }, T('accepted')),
                el('div', { className: 'staff-req-success-note' }, T('acceptedNote'))
              )
            )
          );
        } else if (localState === 'declined') {
          card.appendChild(
            el('div', { className: 'staff-req-declined' }, T('declined'))
          );
        } else if (isQueued) {
          card.appendChild(
            el('div', { className: 'staff-req-queued' }, T('queued'))
          );
        } else if (isActionable && !localState) {
          const acceptBtn = el('button', {
            className: 'btn staff-btn-accept',
            onclick: function () {
              const res = Adapter.staffAccept({ gapId: req.gapId, staffId: user.staffId });
              if (res && res.ok) {
                const fresh = document.getElementById(cardId);
                if (fresh) fresh.replaceWith(renderCard('accepted'));
                rerender();
              }
            },
          }, T('acceptBtn'));

          const declineBtn = el('button', {
            className: 'btn staff-btn-decline',
            onclick: function () {
              const res = Adapter.staffDecline({ gapId: req.gapId, staffId: user.staffId });
              if (res && res.ok) {
                const fresh = document.getElementById(cardId);
                if (fresh) fresh.replaceWith(renderCard('declined'));
                rerender();
              }
            },
          }, T('declineBtn'));

          card.appendChild(
            el('div', { className: 'staff-req-actions' }, acceptBtn, declineBtn)
          );
          card.appendChild(
            el('div', { className: 'staff-req-sms-note' }, T('acceptedNote'))
          );
        }

        if (existing) existing.replaceWith(card);
        return card;
      }

      reqGrid.appendChild(renderCard(null));
    });
  };

  // ----------------------------------------------------------
  // staffCovers — "Mina vikariat"
  // ----------------------------------------------------------
  VK.views.staffCovers = function staffCovers(container, ctx) {
    const { el, components, user, Adapter } = ctx; // eslint-disable-line no-unused-vars

    const covers = (user && user.staffId)
      ? (Adapter.getCoversForStaff(user.staffId) || [])
      : [];

    if (!covers.length) {
      container.appendChild(
        el('div', { className: 'staff-card staff-card-empty' },
          components.emptyState('📅', T('noCovers'))
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

    function coverDate(c) { return c.date || (c.gap && c.gap.date) || ''; }

    const upcoming = covers.filter(function (c) { return coverDate(c) >= todayStr; });
    const past     = covers.filter(function (c) { return coverDate(c) <  todayStr; });

    function cmpAsc(a, b) {
      const d = coverDate(a).localeCompare(coverDate(b));
      if (d !== 0) return d;
      return ((a.gap && a.gap.startTime) || '').localeCompare((b.gap && b.gap.startTime) || '');
    }
    upcoming.sort(cmpAsc);
    past.sort(function (a, b) { return -cmpAsc(a, b); });

    // ── Helper: render one cover card ─────────────────────────
    function renderCoverCard(cover, isPast) {
      const gap     = cover.gap || {};
      const date    = cover.date || gap.date || '';
      const subject = cover.subject || gap.subject || '—';
      const group   = gap.group || '';
      const teacher = gap.teacherName || '';

      const cardClass = 'staff-card staff-cover-card' + (isPast ? ' staff-cover-card--past' : '');
      const card = el('div', { className: cardClass });

      card.appendChild(
        el('div', { className: 'staff-cover-when' },
          el('span', { className: 'staff-cover-date' }, VK.fmt.date(date)),
          el('span', { className: 'staff-cover-time' },
            VK.fmt.timeRange(gap.startTime || '', gap.endTime || '')
          )
        )
      );

      card.appendChild(
        el('div', { className: 'staff-cover-subject' },
          subject + (group ? ' · ' + group : '')
        )
      );

      if (teacher) {
        card.appendChild(
          el('div', { className: 'staff-cover-teacher' },
            T('covers') + ': ' + teacher
          )
        );
      }

      const planSection = buildLessonPlanSection(el, components, cover);
      if (planSection) card.appendChild(planSection);

      return card;
    }

    // ── Upcoming section ──────────────────────────────────────
    container.appendChild(
      el('div', { className: 'staff-section-heading' },
        T('coversTitle') + (upcoming.length ? ' (' + upcoming.length + ')' : '')
      )
    );

    if (upcoming.length) {
      const upcomingGrid = el('div', { className: 'staff-card-list' });
      container.appendChild(upcomingGrid);
      upcoming.forEach(function (c) {
        upcomingGrid.appendChild(renderCoverCard(c, false));
      });
    } else {
      container.appendChild(
        el('div', { className: 'staff-section-empty' }, T('noUpcoming'))
      );
    }

    // ── Past section (only when there are past covers) ────────
    const PAST_VISIBLE = 5;
    if (past.length) {
      container.appendChild(
        el('div', { className: 'staff-section-heading staff-section-heading--past' },
          T('coversTitlePast') + ' (' + past.length + ')'
        )
      );

      const pastGrid = el('div', { className: 'staff-card-list' });
      container.appendChild(pastGrid);
      const visible = past.slice(0, PAST_VISIBLE);
      visible.forEach(function (c) {
        pastGrid.appendChild(renderCoverCard(c, true));
      });

      if (past.length > PAST_VISIBLE) {
        const extra = past.length - PAST_VISIBLE;
        container.appendChild(
          el('div', { className: 'staff-older-line' },
            T('olderLine').replace('{n}', extra)
          )
        );
      }
    }
  };

  // ----------------------------------------------------------
  // staffWorkload — "Min arbetsbörda"
  // ----------------------------------------------------------
  VK.views.staffWorkload = function staffWorkload(container, ctx) {
    const { el, user, Adapter } = ctx;

    const w = (user && user.staffId)
      ? (Adapter.getStaffWorkload(user.staffId) || {})
      : {};

    const coversThisMonth = Number(w.coversThisMonth) || 0;
    const coverLimit      = Number(w.coverLimit)      || 0;
    const workloadPct     = Number(w.workloadPct)     || 0;
    const hoursThisMonth  = Math.round(Number(w.hoursThisMonth) || 0);

    // Gauge colour thresholds
    const barClass = workloadPct >= 90
      ? 'staff-workload-bar-red'
      : workloadPct >= 70
        ? 'staff-workload-bar-amber'
        : 'staff-workload-bar-green';

    const card = el('div', { className: 'staff-card staff-workload-card' });

    // Heading
    card.appendChild(
      el('div', { className: 'staff-workload-heading' }, T('workloadHeading'))
    );

    if (coversThisMonth === 0 && coverLimit === 0) {
      card.appendChild(
        el('div', { className: 'staff-workload-empty' }, T('noWorkload'))
      );
    } else {
      // Big figure: "3 av 8 pass"
      const limitText = T('limitLabel').replace('{limit}', String(coverLimit));
      card.appendChild(
        el('div', { className: 'staff-workload-figure' },
          el('span', { className: 'staff-workload-big' }, String(coversThisMonth)),
          el('span', { className: 'staff-workload-of' }, ' / ' + String(coverLimit)),
          el('div', { className: 'staff-workload-figure-label' }, T('coversThisMonth')),
          el('div', { className: 'staff-workload-limit-label' }, limitText)
        )
      );

      // Progress bar
      const pct = Math.min(100, Math.round(workloadPct));
      const barWrap = el('div', { className: 'staff-workload-bar-track' });
      const barFill = el('div', {
        className: 'staff-workload-bar-fill ' + barClass,
        style: 'width:' + pct + '%',
      });
      barWrap.appendChild(barFill);
      card.appendChild(barWrap);
      card.appendChild(
        el('div', { className: 'staff-workload-pct-label' }, VK.fmt.percent(workloadPct))
      );

      // Hours
      card.appendChild(
        el('div', { className: 'staff-workload-hours' },
          el('span', { className: 'staff-workload-hours-val' }, String(hoursThisMonth)),
          ' ' + T('hoursLabel')
        )
      );
    }

    // Explanatory note
    card.appendChild(
      el('div', { className: 'staff-workload-note' }, T('workloadNote'))
    );

    container.appendChild(card);
  };

}());
