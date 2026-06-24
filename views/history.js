// ============================================================
// views/history.js — Coordinator "Historik" (History + Analytics)
// VK.views.history(container, ctx)
// ============================================================

(function () {
  'use strict';

  const VK = (window.VK = window.VK || {});
  VK.views = VK.views || {};

  // Local i18n
  const LOCAL = {
    sv: {
      pageTitle:        'Historik',
      sectionAnalytics: 'Analys',
      metricFillRate:   'Tillsättningsgrad',
      metricAvgTime:    'Snitt till tillsättning',
      metricCost:       'Total kostnad',
      metricDecline:    'Avböjandegrad',
      modeBreakdown:    'Erbjudanden per läge',
      modeAdmin:        'Admin',
      modePool:         'Pool',
      modeCascade:      'Kaskad',
      sectionLog:       'Händelselogg',
      filterLabel:      'Filtrera typ',
      filterAll:        'Alla händelser',
      emptyLog:         'Inga händelser',
      emptyLogSub:      'Starta demo-flödet för att generera loggposter.',
      minUnit:          'min',
      // Cost overview
      sectionCost:         'Kostnadsöversikt',
      costTotal:           'Total täckningskostnad',
      costExternal:        'Extern täckning',
      costInternal:        'Intern täckning',
      costPerFill:         'Kostnad per externt pass',
      costNote:            'Översikten visar var täckningskostnaden uppstår. Fler externa pass innebär högre kostnad; intern täckning utnyttjar befintlig personal.',
      costScenarioLine:    function (n, delta) {
        return 'Intern täckning bär ingen extern kostnad. Skillnad mot om alla ' + n + ' pass täckts externt: ' + delta + ' kr.';
      },
      passUnit:            'pass',
      // Event type labels
      gap_created:      'Pass skapades',
      offer_sent:       'Erbjudande skickat',
      target_contacted: 'Vikarie kontaktad',
      offer_accepted:   'Erbjudande accepterat',
      offer_declined:   'Erbjudande avböjt',
      target_expired:   'Svarstid gick ut',
      offer_expired:    'Erbjudande utgånget',
      admin_assigned:   'Admin tillsatte',
      offer_cancelled:  'Erbjudande avbrutet',
      sub_created:      'Vikarie skapad',
      sub_updated:      'Vikarie uppdaterad',
      sub_deactivated:  'Vikarie inaktiverad',
      sub_deleted:      'Vikarie borttagen',
    },
    en: {
      pageTitle:        'History',
      sectionAnalytics: 'Analytics',
      metricFillRate:   'Fill rate',
      metricAvgTime:    'Avg time to fill',
      metricCost:       'Total cost',
      metricDecline:    'Decline rate',
      modeBreakdown:    'Offers by mode',
      modeAdmin:        'Admin',
      modePool:         'Pool',
      modeCascade:      'Cascade',
      sectionLog:       'Audit log',
      filterLabel:      'Filter type',
      filterAll:        'All events',
      emptyLog:         'No events',
      emptyLogSub:      'Run through the demo flow to generate log entries.',
      minUnit:          'min',
      // Cost overview
      sectionCost:         'Cost overview',
      costTotal:           'Total cover cost',
      costExternal:        'External cover',
      costInternal:        'Internal cover',
      costPerFill:         'Cost per external fill',
      costNote:            'This overview shows where cover cost arises. More external fills means higher cost; internal cover utilises existing staff.',
      costScenarioLine:    function (n, delta) {
        return 'Internal cover carries no external cost. Difference vs covering all ' + n + ' as external: ' + delta + ' kr.';
      },
      passUnit:            'fills',
      gap_created:      'Gap created',
      offer_sent:       'Offer sent',
      target_contacted: 'Sub contacted',
      offer_accepted:   'Offer accepted',
      offer_declined:   'Offer declined',
      target_expired:   'Response expired',
      offer_expired:    'Offer expired',
      admin_assigned:   'Admin assigned',
      offer_cancelled:  'Offer cancelled',
      sub_created:      'Sub created',
      sub_updated:      'Sub updated',
      sub_deactivated:  'Sub deactivated',
      sub_deleted:      'Sub deleted',
    },
  };

  function T(k) { return (LOCAL[VK.lang.get()] || LOCAL.sv)[k] || k; }

  // Type → icon + badge variant
  const TYPE_META = {
    gap_created:      { icon: '📋', variant: 'muted'  },
    offer_sent:       { icon: '📤', variant: 'blue'   },
    target_contacted: { icon: '📨', variant: 'blue'   },
    offer_accepted:   { icon: '✅', variant: 'green'  },
    offer_declined:   { icon: '❌', variant: 'muted'  },
    target_expired:   { icon: '⏰', variant: 'amber'  },
    offer_expired:    { icon: '⌛', variant: 'amber'  },
    admin_assigned:   { icon: '👤', variant: 'violet' },
    offer_cancelled:  { icon: '🚫', variant: 'muted'  },
    sub_created:      { icon: '➕', variant: 'green'  },
    sub_updated:      { icon: '✏️',  variant: 'muted'  },
    sub_deactivated:  { icon: '⛔', variant: 'amber'  },
    sub_deleted:      { icon: '🗑',  variant: 'muted'  },
  };

  function buildAnalytics(el, fmt, components, analytics) {
    const { fillRate, avgMinutesToFill, totalCostSek, offersByMode, declineRate } = analytics;

    // Metric strip
    const metrics = el('div', { className: 'history-metrics-grid' },
      components.metricCard(T('metricFillRate'),   fmt.percent(fillRate)),
      components.metricCard(T('metricAvgTime'),    fmt.int(avgMinutesToFill) + ' ' + T('minUnit')),
      components.metricCard(T('metricCost'),       fmt.currency(totalCostSek)),
      components.metricCard(T('metricDecline'),    fmt.percent(declineRate))
    );

    // Mode breakdown
    const total = (offersByMode.admin_assign || 0) + (offersByMode.open_pool || 0) + (offersByMode.cascade || 0) || 1;
    function modeBar(labelKey, count, color) {
      const pct = Math.round((count / total) * 100);
      return el('div', { className: 'history-mode-row' },
        el('span', { className: 'history-mode-label' }, T(labelKey)),
        el('div', { className: 'history-mode-bar-wrap' },
          el('div', { className: 'history-mode-bar history-mode-bar-' + color,
            style: 'width:' + pct + '%' })
        ),
        el('span', { className: 'history-mode-count' }, fmt.int(count))
      );
    }

    const modeBreakdown = el('div', { className: 'history-mode-breakdown' },
      el('div', { className: 'history-mode-title' }, T('modeBreakdown')),
      modeBar('modeAdmin',   offersByMode.admin_assign || 0, 'navy'),
      modeBar('modePool',    offersByMode.open_pool    || 0, 'blue'),
      modeBar('modeCascade', offersByMode.cascade      || 0, 'violet')
    );

    return el('div', { className: 'history-analytics-section' },
      el('div', { className: 'history-section-title' }, T('sectionAnalytics')),
      metrics,
      modeBreakdown
    );
  }

  function buildCostOverview(el, fmt, components, analytics) {
    const {
      totalCostSek, externalCostSek, internalCostSek,
      externalCoverCount, internalCoverCount, estimatedSavingsSek,
    } = analytics;

    // Metric cards row
    var externalSubLabel = externalCoverCount + ' ' + T('passUnit');
    var internalSubLabel = internalCoverCount + ' ' + T('passUnit');
    var metricsRow = el('div', { className: 'history-cost-metrics-grid' },
      components.metricCard(T('costTotal'),    fmt.currency(totalCostSek)),
      components.metricCard(T('costExternal'), fmt.currency(externalCostSek), externalSubLabel),
      components.metricCard(T('costInternal'), fmt.currency(internalCostSek), internalSubLabel)
    );

    // Cost per external fill (guard divide-by-zero)
    var perFillRow = null;
    if (externalCoverCount > 0) {
      var perFill = Math.round(externalCostSek / externalCoverCount);
      perFillRow = el('div', { className: 'history-cost-stat-row' },
        el('span', { className: 'history-cost-stat-label' }, T('costPerFill')),
        el('span', { className: 'history-cost-stat-value' },
          perFill.toLocaleString() + ' kr'
        )
      );
    }

    // Neutral scenario comparison line
    // Total covers = internal + external; scenario: all covered as external
    var totalCovers = internalCoverCount + externalCoverCount;
    var scenarioLine = null;
    if (internalCoverCount > 0 && totalCovers > 0) {
      var delta = Math.round(estimatedSavingsSek);
      var scenarioText = T('costScenarioLine')(totalCovers, delta.toLocaleString());
      scenarioLine = el('div', { className: 'history-cost-scenario' }, scenarioText);
    }

    // Neutral note
    var noteEl = el('div', { className: 'history-cost-note' }, T('costNote'));

    var inner = el('div', { className: 'history-cost-inner' },
      metricsRow,
      perFillRow || el('span', {}),
      scenarioLine || el('span', {}),
      noteEl
    );

    return el('div', { className: 'history-cost-section' },
      el('div', { className: 'history-section-title' }, T('sectionCost')),
      inner
    );
  }

  function buildEventRow(el, fmt, components, event) {
    const meta = TYPE_META[event.type] || { icon: '◎', variant: 'muted' };
    const label = T(event.type) || event.type;
    const desc  = event.detail ? label + ' — ' + event.detail : label;
    const ts    = event.wallTs || event.ts;
    return el('div', { className: 'history-event-row' },
      el('span', { className: 'history-event-icon' }, meta.icon),
      el('div',  { className: 'history-event-body' },
        components.badge(label, meta.variant),
        el('span', { className: 'history-event-desc' },
          event.detail ? ' — ' + event.detail : ''
        )
      ),
      el('span', { className: 'history-event-time' }, fmt.clock(ts))
    );
  }

  VK.views.history = function history(container, ctx) {
    const { el, Adapter, fmt, components } = ctx;

    const analytics = Adapter.getAnalytics();
    const allEvents = Adapter.listHistory();

    // Collect distinct types for filter
    const typeSet = [];
    allEvents.forEach(function (e) {
      if (!typeSet.includes(e.type)) typeSet.push(e.type);
    });

    // ── Analytics section ────────────────────────────────────
    const analyticsSection = buildAnalytics(el, fmt, components, analytics);

    // ── Cost overview section ────────────────────────────────
    const costSection = buildCostOverview(el, fmt, components, analytics);

    // ── Log section: filter + list ───────────────────────────
    const logList = el('div', { className: 'history-log-list' });

    function renderLog(typeFilter) {
      while (logList.firstChild) logList.removeChild(logList.firstChild);
      const events = typeFilter ? Adapter.listHistory({ type: typeFilter }) : allEvents;
      if (!events.length) {
        logList.appendChild(
          components.emptyState('◎', T('emptyLog'), T('emptyLogSub'))
        );
        return;
      }
      events.forEach(function (event) {
        logList.appendChild(buildEventRow(el, fmt, components, event));
      });
    }

    // Build filter select
    const filterSelect = el('select', {
      className: 'history-filter-select',
      onchange: function () { renderLog(this.value || null); },
    });
    filterSelect.appendChild(el('option', { value: '' }, T('filterAll')));
    typeSet.forEach(function (type) {
      filterSelect.appendChild(el('option', { value: type }, T(type) || type));
    });

    renderLog(null);

    const logSection = el('div', { className: 'history-log-section' },
      el('div', { className: 'history-log-header' },
        el('div', { className: 'history-section-title' }, T('sectionLog')),
        el('div', { className: 'history-filter-wrap' },
          el('label', { className: 'history-filter-label' }, T('filterLabel')),
          filterSelect
        )
      ),
      logList
    );

    const wrap = el('div', { className: 'history-page' },
      el('div', { className: 'history-page-title' }, T('pageTitle')),
      analyticsSection,
      costSection,
      logSection
    );

    container.appendChild(wrap);
  };

}());
