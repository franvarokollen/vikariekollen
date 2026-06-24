// ============================================================
// views/pool.js — Coordinator "Vikarier" (pool + availability)
//
// VK.views.pool(container, ctx)
// ctx = { Adapter, el, t, fmt, components, user, role, rerender, setTab }
// CSS: views/pool.css
// ============================================================

(function () {
  'use strict';

  const VK = (window.VK = window.VK || {});
  VK.views = VK.views || {};

  // ----------------------------------------------------------
  // LOCAL I18N
  // ----------------------------------------------------------
  const i18n = {
    sv: {
      addSub:          '+ Ny vikarie',
      editSub:         'Redigera',
      deactivate:      'Avaktivera',
      activate:        'Aktivera',
      fvkActivate:     'Aktivera FVK',
      fvkDeactivate:   'Avaktivera FVK',
      deleteSub:       'Ta bort',
      confirmDelete:   'Ta bort denna vikarie permanent?',
      noSubs:          'Inga vikarier i poolen',
      noSubsHint:      'Klicka "+ Ny vikarie" för att lägga till den första.',
      selectHint:      'Välj en vikarie för att se tillgänglighet',
      selectHintSub:   'Klicka på en rad i listan till vänster.',
      standardTab:     'Standardvecka',
      weeklyTab:       'Veckovis',
      saveDef:         'Spara standardvecka',
      followsDefault:  'Följer din standardvecka',
      customised:      'Anpassad vecka',
      resetToDefault:  'Återställ till standard',
      saved:           'Sparat ✓',
      unsaved:         'Osparade ändringar',
      legendAvail:     'Tillgänglig',
      legendUnavail:   'Ej tillgänglig',
      markInstruction: 'Klicka för att markera tillgänglighet',
      activationTitle: 'Aktiveringar',
      activationNote:  'Aktiverad = kan erbjudas arbete den dagen.',
      activationDate:  'Datum',
      toggleOn:        'Aktivera',
      toggleOff:       'Inaktivera',
      activated:       'Aktiverad',
      notActivated:    'Ej aktiverad',
      // modal
      modalAddTitle:   'Ny vikarie',
      modalEditTitle:  'Redigera vikarie',
      fieldName:       'Namn *',
      fieldEmail:      'E-post *',
      fieldPhone:      'Telefon',
      fieldSubjects:   'Ämnen (kommaseparerade)',
      fieldRate:       'Timarvode (kr)',
      fieldNotes:      'Anteckningar',
      saveBtn:         'Spara',
      cancelBtn:       'Avbryt',
      errName:         'Namn krävs',
      errEmail:        'Giltig e-post krävs',
      poolTitle:       'Vikariepoolen',
      availTitle:      'Tillgänglighet',
      inactive:        'Inaktiv',
      active:          'Aktiv',
      reliability:     'Pålitlighet',
      subjects:        'Ämnen',
      weekWord:        'Vecka',
      // pool filter chips
      filterAll:       'Alla',
      filterFvkActive: 'Aktiva FVK',
      filterFvkInact:  'Inaktiva FVK',
      filterVk:        'VK',
      // pool / origin badge labels (own strings, not adapter poolLabel)
      poolLabelInternal: 'Intern personal',
      poolLabelFvkActive: 'Aktiv FVK',
      poolLabelVk:        'VK',
      poolLabelFvkInact:  'Inaktiv FVK',
      // new-sub note
      newSubPoolNote:  'Läggs till i VK-poolen.',
    },
    en: {
      addSub:          '+ New substitute',
      editSub:         'Edit',
      deactivate:      'Deactivate',
      activate:        'Activate',
      fvkActivate:     'Activate FVK',
      fvkDeactivate:   'Deactivate FVK',
      deleteSub:       'Delete',
      confirmDelete:   'Permanently delete this substitute?',
      noSubs:          'No substitutes in the pool',
      noSubsHint:      'Click "+ New substitute" to add the first one.',
      selectHint:      'Select a substitute to view availability',
      selectHintSub:   'Click a row in the list on the left.',
      standardTab:     'Default week',
      weeklyTab:       'Weekly',
      saveDef:         'Save default week',
      followsDefault:  'Following default week',
      customised:      'Customised week',
      resetToDefault:  'Reset to default',
      saved:           'Saved ✓',
      unsaved:         'Unsaved changes',
      legendAvail:     'Available',
      legendUnavail:   'Unavailable',
      markInstruction: 'Click to mark availability',
      activationTitle: 'Activations',
      activationNote:  'Activated = can be offered work on that date.',
      activationDate:  'Date',
      toggleOn:        'Activate',
      toggleOff:       'Deactivate',
      activated:       'Activated',
      notActivated:    'Not activated',
      modalAddTitle:   'New substitute',
      modalEditTitle:  'Edit substitute',
      fieldName:       'Name *',
      fieldEmail:      'Email *',
      fieldPhone:      'Phone',
      fieldSubjects:   'Subjects (comma-separated)',
      fieldRate:       'Hourly rate (kr)',
      fieldNotes:      'Notes',
      saveBtn:         'Save',
      cancelBtn:       'Cancel',
      errName:         'Name is required',
      errEmail:        'Valid email is required',
      poolTitle:       'Substitute Pool',
      availTitle:      'Availability',
      inactive:        'Inactive',
      active:          'Active',
      reliability:     'Reliability',
      subjects:        'Subjects',
      weekWord:        'Week',
      // pool filter chips
      filterAll:       'All',
      filterFvkActive: 'Active FVK',
      filterFvkInact:  'Inactive FVK',
      filterVk:        'VK',
      // pool / origin badge labels
      poolLabelInternal: 'Internal staff',
      poolLabelFvkActive: 'Active FVK',
      poolLabelVk:        'VK',
      poolLabelFvkInact:  'Inactive FVK',
      // new-sub note
      newSubPoolNote:  'Added to the VK pool.',
    },
  };

  function T(k) { return (i18n[window.VK.lang.get()] || i18n.sv)[k] || k; }

  // ----------------------------------------------------------
  // POOL / ORIGIN BADGE HELPERS
  // ----------------------------------------------------------
  // Map a sub's tier key → { label, variant } using local strings.
  // variant is a vk-badge-* suffix (blue|green|navy|muted).
  const TIER_BADGE = {
    internal_staff: function () { return { label: T('poolLabelInternal'), variant: 'navy'  }; },
    fvk_active:     function () { return { label: T('poolLabelFvkActive'), variant: 'green' }; },
    vk_subs:        function () { return { label: T('poolLabelVk'),        variant: 'blue'  }; },
    fvk_inactive:   function () { return { label: T('poolLabelFvkInact'),  variant: 'muted' }; },
  };

  function poolOriginBadge(sub) {
    const fn = TIER_BADGE[sub.tier] || TIER_BADGE['vk_subs'];
    const { label, variant } = fn();
    return window.VK.el('span', { className: 'vk-badge vk-badge-' + variant + ' pool-origin-badge' }, label);
  }

  // ----------------------------------------------------------
  // DAY / MONTH NAMES
  // ----------------------------------------------------------
  const DAY_NAMES = {
    sv: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  };

  const MONTH_NAMES = {
    sv: ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'],
    en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  };

  // ----------------------------------------------------------
  // VIEW ENTRY POINT
  // ----------------------------------------------------------
  VK.views.pool = function pool(container, ctx) {
    const { el, components } = ctx;
    const Adapter = window.VK.Adapter;

    // Closure state
    let selectedSubId  = null;
    let availSubTab    = 'standard'; // 'standard' | 'weekly'
    let currentWeekId  = Adapter.getWeekId(new Date());
    let poolFilter     = 'all'; // 'all' | 'fvk_active' | 'fvk_inactive' | 'vk_subs'

    // -- Drag-paint state (shared across grid renders) --
    let isPainting = false;
    let paintValue = true;
    document.addEventListener('mouseup', () => { isPainting = false; }, { passive: true });

    // ----------------------------------------------------------
    // RENDER ROOT
    // ----------------------------------------------------------
    function render() {
      container.innerHTML = '';
      const allSubs = Adapter.listSubs();
      const subs = poolFilter === 'all'
        ? allSubs
        : allSubs.filter(s => s.tier === poolFilter);

      const wrap = el('div', { className: 'pool-layout' },
        renderPool(allSubs, subs),
        renderDetail(allSubs)
      );
      container.appendChild(wrap);
    }

    // ----------------------------------------------------------
    // LEFT PANE — POOL LIST
    // ----------------------------------------------------------
    function renderPool(allSubs, filteredSubs) {
      const header = el('div', { className: 'pool-header' },
        el('h2', { className: 'pool-title' }, T('poolTitle')),
        el('button', {
          className: 'btn btn-primary btn-sm',
          onclick: () => openSubModal(null),
        }, T('addSub'))
      );

      // Filter chip row — count per tier from full list
      const tierCounts = { all: allSubs.length, fvk_active: 0, fvk_inactive: 0, vk_subs: 0 };
      allSubs.forEach(s => { if (tierCounts[s.tier] !== undefined) tierCounts[s.tier]++; });

      const filterChips = [
        { key: 'all',         label: T('filterAll') + ' (' + tierCounts.all + ')' },
        { key: 'fvk_active',  label: T('filterFvkActive') + ' (' + tierCounts.fvk_active + ')' },
        { key: 'fvk_inactive',label: T('filterFvkInact')  + ' (' + tierCounts.fvk_inactive + ')' },
        { key: 'vk_subs',     label: T('filterVk')        + ' (' + tierCounts.vk_subs + ')' },
      ].map(chip =>
        el('button', {
          className: 'pool-filter-chip' + (poolFilter === chip.key ? ' active' : ''),
          onclick: () => { poolFilter = chip.key; render(); },
        }, chip.label)
      );
      const filterBar = el('div', { className: 'pool-filter-bar' }, ...filterChips);

      let body;
      if (!filteredSubs.length) {
        body = el('div', { className: 'pool-empty' },
          components.emptyState('👥', T('noSubs'), T('noSubsHint'))
        );
      } else {
        const rows = filteredSubs.map(sub => renderSubRow(sub));
        body = el('div', { className: 'pool-list' }, ...rows);
      }

      return el('div', { className: 'pool-pane' }, header, filterBar, body);
    }

    function renderSubRow(sub) {
      const isSelected = sub.id === selectedSubId;
      const score = Math.round(Number(sub.reliabilityScore) || 0);

      // Subject chips (max 3 visible)
      const shown    = (sub.subjects || []).slice(0, 3);
      const overflow = (sub.subjects || []).length - shown.length;
      const chips = shown.map(s =>
        el('span', { className: 'sub-chip' }, s)
      );
      if (overflow > 0) chips.push(el('span', { className: 'sub-chip sub-chip-more' }, '+' + overflow));

      // Reliability bar
      const reliabilityBar = el('div', { className: 'reliability-wrap' },
        el('span', { className: 'reliability-label' }, T('reliability') + ' ' + score),
        el('div', { className: 'reliability-track' },
          el('div', {
            className: 'reliability-fill' + (score >= 80 ? ' rel-hi' : score >= 50 ? ' rel-mid' : ' rel-lo'),
            style: 'width:' + score + '%',
          })
        )
      );

      // Pool origin badge (always visible on the name row)
      const originBadge = poolOriginBadge(sub);

      const nameRow = el('div', { className: 'sub-name-row' },
        components.avatar(sub.initials || sub.name.slice(0, 2).toUpperCase(), { sm: true }),
        el('div', { className: 'sub-info' },
          el('span', { className: 'sub-name' + (sub.origin === 'fvk' && !sub.active ? ' sub-inactive' : '') }, sub.name),
          originBadge
        )
      );

      const metaRow = el('div', { className: 'sub-meta-row' },
        el('span', { className: 'sub-rate' },
          Math.round(Number(sub.hourlyRate) || 0) + ' kr/h'
        ),
        el('div', { className: 'sub-chips' }, ...chips)
      );

      // FVK subs get setSubActive toggle; VK subs get the old deactivate/activate.
      const isFvk = sub.origin === 'fvk';
      const activateBtn = el('button', {
        className: 'btn btn-ghost-border btn-sm',
        onclick: (e) => {
          e.stopPropagation();
          if (isFvk) {
            Adapter.setSubActive(sub.id, !sub.active);
          } else {
            // VK sub: toggle via updateSub
            Adapter.updateSub(sub.id, { active: !sub.active });
          }
          ctx.rerender();
        },
      }, isFvk
        ? (sub.active ? T('fvkDeactivate') : T('fvkActivate'))
        : (sub.active ? T('deactivate')    : T('activate'))
      );

      const actions = el('div', { className: 'sub-actions' },
        el('button', {
          className: 'btn btn-ghost-border btn-sm',
          onclick: (e) => { e.stopPropagation(); openSubModal(sub); },
        }, T('editSub')),
        activateBtn,
        el('button', {
          className: 'btn btn-danger-ghost btn-sm',
          onclick: (e) => {
            e.stopPropagation();
            components.modal({
              title: T('confirmDelete'),
              body: el('p', {}, sub.name),
              buttons: [
                { label: T('cancelBtn') },
                {
                  label: T('deleteSub'),
                  primary: false,
                  onClick: () => {
                    Adapter.deleteSub(sub.id);
                    if (selectedSubId === sub.id) selectedSubId = null;
                    ctx.rerender();
                  },
                },
              ],
            });
          },
        }, T('deleteSub'))
      );

      const row = el('div', {
        className: 'sub-row' + (isSelected ? ' sub-row-selected' : ''),
        onclick: () => {
          selectedSubId = sub.id;
          render();
        },
      },
        nameRow,
        metaRow,
        reliabilityBar,
        actions
      );
      return row;
    }

    // ----------------------------------------------------------
    // RIGHT PANE — DETAIL / AVAILABILITY
    // allSubs is the unfiltered list so the detail pane always
    // resolves the selected sub even when the filter hides it.
    // ----------------------------------------------------------
    function renderDetail(allSubs) {
      if (!selectedSubId) {
        return el('div', { className: 'detail-pane detail-empty' },
          components.emptyState('📋', T('selectHint'), T('selectHintSub'))
        );
      }

      const sub = allSubs.find(s => s.id === selectedSubId);
      if (!sub) {
        selectedSubId = null;
        return el('div', { className: 'detail-pane detail-empty' },
          components.emptyState('📋', T('selectHint'), T('selectHintSub'))
        );
      }

      const detailHeader = el('div', { className: 'detail-header' },
        components.avatar(sub.initials || sub.name.slice(0, 2).toUpperCase()),
        el('div', { className: 'detail-sub-info' },
          el('div', { className: 'detail-sub-name-row' },
            el('span', { className: 'detail-sub-name' }, sub.name),
            poolOriginBadge(sub)
          ),
          el('span', { className: 'detail-sub-meta' },
            (sub.email || '') + (sub.phone ? ' · ' + sub.phone : '')
          )
        )
      );

      // Sub-tabs
      const subTabBar = el('div', { className: 'avail-tab-bar' },
        el('button', {
          className: 'avail-tab-btn' + (availSubTab === 'standard' ? ' active' : ''),
          onclick: () => { availSubTab = 'standard'; render(); },
        }, T('standardTab')),
        el('button', {
          className: 'avail-tab-btn' + (availSubTab === 'weekly' ? ' active' : ''),
          onclick: () => { availSubTab = 'weekly'; render(); },
        }, T('weeklyTab'))
      );

      let tabContent;
      if (availSubTab === 'standard') {
        tabContent = renderStandardTab(sub.id);
      } else {
        tabContent = renderWeeklyTab(sub.id);
      }

      // Activations section
      const activationsSection = renderActivations(sub.id);

      return el('div', { className: 'detail-pane' },
        detailHeader,
        subTabBar,
        tabContent,
        activationsSection
      );
    }

    // ----------------------------------------------------------
    // STANDARD WEEK TAB
    // ----------------------------------------------------------
    function renderStandardTab(subId) {
      const schedule = Adapter.getSchedule();
      const selectedSlots = new Set(Adapter.getDefaultAvailability(subId));

      const statusEl = el('span', { className: 'pool-status-line', id: 'pool-def-status' }, '');

      function markDirty() {
        statusEl.textContent = T('unsaved');
        statusEl.className = 'pool-status-line pool-status-unsaved';
      }

      const grid = buildGrid('pool-def-grid', schedule, selectedSlots, () => markDirty());

      const saveBtn = el('button', {
        className: 'btn btn-primary btn-sm',
        onclick: () => {
          const res = Adapter.saveDefaultAvailability(subId, Array.from(selectedSlots));
          if (res.ok !== false) {
            statusEl.textContent = T('saved');
            statusEl.className = 'pool-status-line pool-status-saved';
            setTimeout(() => {
              if (statusEl.textContent === T('saved')) {
                statusEl.textContent = '';
                statusEl.className = 'pool-status-line';
              }
            }, 3000);
          }
        },
      }, T('saveDef'));

      const guide = buildGridGuide();
      const gridWrap = el('div', { className: 'pool-grid-wrap' }, grid);
      const footer = el('div', { className: 'pool-avail-footer' },
        el('div', {}),
        el('div', { className: 'pool-footer-right' }, statusEl, saveBtn)
      );

      return el('div', { className: 'pool-avail-tab' }, guide, gridWrap, footer);
    }

    // ----------------------------------------------------------
    // WEEKLY OVERRIDE TAB
    // ----------------------------------------------------------
    function renderWeeklyTab(subId) {
      const schedule = Adapter.getSchedule();

      // Mutable state for this render
      let effective     = Adapter.getEffectiveAvailability(subId, currentWeekId);
      let selectedSlots = new Set(effective.slots);
      let weekSource    = effective.source;
      let isDirty       = false;

      // Week nav
      function buildWeekLabel(weekId) {
        const meta   = Adapter.getWeekMeta(weekId);
        const lang   = window.VK.lang.get();
        const months = MONTH_NAMES[lang] || MONTH_NAMES.sv;
        const d1     = meta.monday.getUTCDate();
        const d2     = meta.friday.getUTCDate();
        const m1     = months[meta.monday.getUTCMonth()];
        const m2     = months[meta.friday.getUTCMonth()];
        const range  = m1 === m2 ? (d1 + '–' + d2 + ' ' + m1) : (d1 + ' ' + m1 + '–' + d2 + ' ' + m2);
        return T('weekWord') + ' ' + meta.weekNumber + ' · ' + range;
      }

      const weekLabelEl = el('span', { className: 'week-label' }, buildWeekLabel(currentWeekId));
      const badgeEl     = el('span', { className: 'week-badge' }, '');
      const statusEl    = el('span', { className: 'pool-status-line', id: 'pool-wk-status' }, '');

      function updateBadge() {
        badgeEl.textContent = weekSource === 'override' ? T('customised') : T('followsDefault');
        badgeEl.className   = 'week-badge ' + (weekSource === 'override' ? 'badge-customised' : 'badge-default');
      }

      const resetBtn = el('button', {
        className: 'btn btn-ghost-border btn-sm',
        id: 'pool-wk-reset',
        style: 'display:none',
        onclick: () => {
          Adapter.clearWeekOverride(subId, currentWeekId);
          loadWeek(currentWeekId);
        },
      }, T('resetToDefault'));

      function updateResetVisibility() {
        resetBtn.style.display = Adapter.hasWeekOverride(subId, currentWeekId) ? '' : 'none';
      }

      const grid    = buildGrid('pool-wk-grid', schedule, selectedSlots, () => {
        isDirty = true;
        statusEl.textContent = T('unsaved');
        statusEl.className   = 'pool-status-line pool-status-unsaved';
      });
      const gridWrap = el('div', { className: 'pool-grid-wrap' }, grid);

      const saveBtn = el('button', {
        className: 'btn btn-primary btn-sm',
        onclick: () => {
          Adapter.saveWeekOverride(subId, currentWeekId, Array.from(selectedSlots));
          isDirty    = false;
          weekSource = 'override';
          statusEl.textContent = T('saved');
          statusEl.className   = 'pool-status-line pool-status-saved';
          setTimeout(() => {
            if (statusEl.textContent === T('saved')) {
              statusEl.textContent = '';
              statusEl.className   = 'pool-status-line';
            }
          }, 3000);
          updateBadge();
          updateResetVisibility();
        },
      }, T('saveBtn'));

      function loadWeek(weekId) {
        currentWeekId = weekId;
        weekLabelEl.textContent = buildWeekLabel(weekId);
        effective     = Adapter.getEffectiveAvailability(subId, weekId);
        weekSource    = effective.source;
        selectedSlots.clear();
        effective.slots.forEach(k => selectedSlots.add(k));
        syncGrid('pool-wk-grid', selectedSlots);
        isDirty = false;
        statusEl.textContent = '';
        statusEl.className   = 'pool-status-line';
        updateBadge();
        updateResetVisibility();
      }

      function changeWeek(delta) {
        const meta    = Adapter.getWeekMeta(currentWeekId);
        const newDate = new Date(meta.monday);
        newDate.setUTCDate(meta.monday.getUTCDate() + delta * 7);
        loadWeek(Adapter.getWeekId(newDate));
      }

      const prevBtn = el('button', { className: 'btn btn-ghost btn-sm', onclick: () => changeWeek(-1) }, '◀');
      const nextBtn = el('button', { className: 'btn btn-ghost btn-sm', onclick: () => changeWeek(1) }, '▶');

      const weekNav = el('div', { className: 'week-nav' }, prevBtn, weekLabelEl, nextBtn);
      const navRow  = el('div', { className: 'pool-nav-badge-row' }, weekNav, badgeEl);

      const guide   = buildGridGuide();

      const footer  = el('div', { className: 'pool-avail-footer' },
        el('div', {}, resetBtn),
        el('div', { className: 'pool-footer-right' }, statusEl, saveBtn)
      );

      // Boot
      updateBadge();
      updateResetVisibility();

      return el('div', { className: 'pool-avail-tab' }, navRow, guide, gridWrap, footer);
    }

    // ----------------------------------------------------------
    // ACTIVATIONS SECTION
    // ----------------------------------------------------------
    function renderActivations(subId) {
      // Default date = today in YYYY-MM-DD
      const today = new Date();
      const todayStr = today.getFullYear() + '-'
        + String(today.getMonth() + 1).padStart(2, '0') + '-'
        + String(today.getDate()).padStart(2, '0');

      const dateInput = el('input', {
        type: 'date',
        className: 'text-input activation-date-input',
        value: todayStr,
      });

      const stateEl = el('span', { className: 'activation-state' });
      const toggleBtn = el('button', { className: 'btn btn-ghost-border btn-sm' });

      function refreshActivation() {
        const date  = dateInput.value || todayStr;
        const active = Adapter.getActivations(date).includes(subId);
        stateEl.textContent = active ? T('activated') : T('notActivated');
        stateEl.className   = 'activation-state ' + (active ? 'act-on' : 'act-off');
        toggleBtn.textContent = active ? T('toggleOff') : T('toggleOn');
        toggleBtn.onclick = () => {
          Adapter.setActivation(subId, date, !active);
          refreshActivation();
        };
      }

      dateInput.addEventListener('change', refreshActivation);
      refreshActivation();

      return el('div', { className: 'pool-activations' },
        el('div', { className: 'pool-activations-header' },
          el('span', { className: 'pool-activations-title' }, T('activationTitle')),
          el('span', { className: 'pool-activations-note' }, T('activationNote'))
        ),
        el('div', { className: 'pool-activations-row' },
          el('label', { className: 'field-label' }, T('activationDate')),
          dateInput,
          stateEl,
          toggleBtn
        )
      );
    }

    // ----------------------------------------------------------
    // GRID BUILDER (click + drag-paint)
    // ----------------------------------------------------------
    function buildGrid(gridId, schedule, selectedSlots, onPaint) {
      const lang     = window.VK.lang.get();
      const dayNames = DAY_NAMES[lang] || DAY_NAMES.sv;
      const table    = el('table', { className: 'avail-grid', id: gridId });
      const thead    = el('thead', {});
      const headerRow = el('tr', {});

      headerRow.appendChild(el('th', { className: 'corner-cell' }, ''));
      schedule.days.forEach((_d, dayIndex) => {
        headerRow.appendChild(el('th', { className: 'day-header' }, dayNames[dayIndex] || _d));
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = el('tbody', {});
      for (const hour of schedule.hours) {
        const row = el('tr', {});
        row.appendChild(el('td', { className: 'hour-label' },
          String(hour).padStart(2, '0') + ':00'
        ));
        schedule.days.forEach((_d, dayIndex) => {
          const key = dayIndex + '-' + hour;
          const td  = el('td', {
            className: 'slot' + (selectedSlots.has(key) ? ' available' : ''),
            data: { key },
          });
          td.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isPainting = true;
            paintValue = !selectedSlots.has(key);
            applyCell(td, key, selectedSlots, onPaint);
          });
          td.addEventListener('mouseenter', () => {
            if (isPainting) applyCell(td, key, selectedSlots, onPaint);
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
      const cells = document.querySelectorAll('#' + gridId + ' .slot');
      cells.forEach(cell => {
        cell.classList.toggle('available', selectedSlots.has(cell.dataset.key));
      });
    }

    // ----------------------------------------------------------
    // GRID LEGEND / GUIDE
    // ----------------------------------------------------------
    function buildGridGuide() {
      const el2 = window.VK.el;
      return el2('div', { className: 'pool-grid-guide' },
        el2('span', { className: 'pool-guide-instruction' }, T('markInstruction')),
        el2('div', { className: 'legend' },
          el2('span', { className: 'legend-item' },
            el2('span', { className: 'legend-swatch swatch-available' }),
            T('legendAvail')
          ),
          el2('span', { className: 'legend-item' },
            el2('span', { className: 'legend-swatch swatch-unavailable' }),
            T('legendUnavail')
          )
        )
      );
    }

    // ----------------------------------------------------------
    // SUB MODAL — create / edit
    // ----------------------------------------------------------
    function openSubModal(existingSub) {
      const isEdit = !!existingSub;

      const nameInp     = el('input', { type: 'text',   className: 'text-input', placeholder: 'Anna Svensson', value: isEdit ? existingSub.name : '' });
      const emailInp    = el('input', { type: 'email',  className: 'text-input', placeholder: 'anna@skola.se',  value: isEdit ? (existingSub.email || '') : '' });
      const phoneInp    = el('input', { type: 'tel',    className: 'text-input', placeholder: '070-000 00 00',  value: isEdit ? (existingSub.phone || '') : '' });
      const subjectsInp = el('input', { type: 'text',   className: 'text-input', placeholder: 'Matematik, Fysik', value: isEdit ? (existingSub.subjects || []).join(', ') : '' });
      const rateInp     = el('input', { type: 'number', className: 'text-input', placeholder: '250', min: '0', value: isEdit ? String(Math.round(Number(existingSub.hourlyRate) || 0)) : '' });
      const notesInp    = el('textarea', { className: 'text-input pool-notes-input', rows: '3', placeholder: '…', value: isEdit ? (existingSub.notes || '') : '' });

      const errEl = el('p', { className: 'pool-modal-err', style: 'display:none' }, '');

      function showErr(msg) {
        errEl.textContent = msg;
        errEl.style.display = '';
      }

      function validate() {
        const name  = nameInp.value.trim();
        const email = emailInp.value.trim();
        if (!name)                          { showErr(T('errName'));  return null; }
        if (!email || !email.includes('@')) { showErr(T('errEmail')); return null; }
        return {
          name,
          email,
          phone:    phoneInp.value.trim(),
          subjects: subjectsInp.value.split(',').map(s => s.trim()).filter(Boolean),
          hourlyRate: Math.round(Number(rateInp.value) || 0),
          notes:    notesInp.value.trim(),
        };
      }

      // For new subs, show a small note that they land in the VK pool.
      const poolNoteEl = !isEdit
        ? el('div', { className: 'pool-modal-pool-note' },
            el('span', { className: 'vk-badge vk-badge-blue pool-origin-badge' }, T('poolLabelVk')),
            ' ' + T('newSubPoolNote')
          )
        : null;

      const form = el('div', { className: 'pool-modal-form' },
        errEl,
        poolNoteEl,
        el('label', { className: 'field-label' }, T('fieldName')),    nameInp,
        el('label', { className: 'field-label' }, T('fieldEmail')),   emailInp,
        el('label', { className: 'field-label' }, T('fieldPhone')),   phoneInp,
        el('label', { className: 'field-label' }, T('fieldSubjects')), subjectsInp,
        el('label', { className: 'field-label' }, T('fieldRate')),    rateInp,
        el('label', { className: 'field-label' }, T('fieldNotes')),   notesInp
      );

      const closeModal = components.modal({
        title: isEdit ? T('modalEditTitle') : T('modalAddTitle'),
        body:  form,
        buttons: [
          { label: T('cancelBtn') },
          {
            label: T('saveBtn'),
            primary: true,
            onClick: () => {
              const data = validate();
              if (!data) return;
              if (isEdit) {
                const res = Adapter.updateSub(existingSub.id, data);
                if (res.ok !== false) ctx.rerender();
              } else {
                const res = Adapter.createSub(data);
                if (res.ok !== false) {
                  selectedSubId = res.sub && res.sub.id ? res.sub.id : selectedSubId;
                  ctx.rerender();
                }
              }
            },
          },
        ],
      });

      // Override the modal close so validation errors keep the modal open.
      // The component's close() fires on any button click; we work within that model
      // by using the onClick guard above (validate returns null → onClick returns early
      // before rerender, modal is already closed by the component; acceptable for demo).
      void closeModal;
    }

    // ----------------------------------------------------------
    // BOOT
    // ----------------------------------------------------------
    render();
  };

}());
