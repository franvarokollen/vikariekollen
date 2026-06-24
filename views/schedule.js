// ============================================================
// views/schedule.js — "Schema" (grid) view for the coordinator.
//
// A day-at-a-glance timetable of the day's gaps (absences), in three
// layouts the coordinator can toggle:
//   · per teacher  — one column per absent teacher
//   · whole day    — one shared column, overlaps split side by side
//   · per class    — one column per affected class
//
// Time runs down the Y axis; each gap is a coloured block placed at its
// real start/end, coloured by status. Click a block → details + a demo
// assign control. Reads gaps via ctx.Adapter.listGaps() ONLY (never
// touches storage). Ported from the Frånvarokollen cover schedule view.
// ============================================================
(function () {
  'use strict';
  const VK = window.VK;

  // Vertical scale. 1.05 px/min → 63 px per hour (kept in sync with the
  // 63px hour gridline in schedule.css).
  const PX_PER_MIN = 1.05;
  const HEADER_H = 28;
  const COL_W = { teacher: 122, day: 460, class: 110 };

  // status → block style class + i18n label key (matches shell statusBadge).
  const STATUS = {
    open_unsent: { cls: 'is-unsent',  labelKey: 'statusOpenUnsent' },
    open_pool:   { cls: 'is-pool',    labelKey: 'statusOpenPool' },
    cascade:     { cls: 'is-cascade', labelKey: 'statusCascade' },
    filled:      { cls: 'is-filled',  labelKey: 'statusFilled' },
    expired:     { cls: 'is-expired', labelKey: 'statusExpired' },
  };

  function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOf(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Greedy lane packing so overlapping gaps in one column sit side by side.
  function packLanes(items) {
    const sorted = [...items].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    const ends = [];
    const lane = {};
    sorted.forEach(g => {
      const s = toMin(g.startTime), e = toMin(g.endTime);
      let placed = false;
      for (let i = 0; i < ends.length; i++) {
        if (ends[i] <= s) { lane[g.id] = i; ends[i] = e; placed = true; break; }
      }
      if (!placed) { lane[g.id] = ends.length; ends.push(e); }
    });
    return { lane, count: Math.max(1, ends.length) };
  }

  VK.views.schedule = function schedule(container, ctx) {
    const { el, t, fmt, components, Adapter } = ctx;

    const allGaps = Adapter.listGaps();
    const dates = [...new Set(allGaps.map(g => g.date))].sort();
    const todayIso = isoOf(Adapter.now());

    let date = dates.includes(todayIso) ? todayIso : (dates[0] || todayIso);
    let layout = 'teacher';

    function gapsForDate(d) { return allGaps.filter(g => g.date === d); }

    function columnsFor(gaps) {
      if (layout === 'day') {
        return [{ key: 'all', label: t('schAllLessons') + ' (' + gaps.length + ')', items: gaps }];
      }
      const order = [];
      const map = {};
      gaps.forEach(g => {
        const key = layout === 'teacher' ? g.teacherName : (g.group || '—');
        if (!map[key]) { map[key] = { key: key, label: key, items: [] }; order.push(key); }
        map[key].items.push(g);
      });
      if (layout === 'class') order.sort((a, b) => a.localeCompare(b));
      return order.map(k => map[k]);
    }

    function openGap(g) {
      const body = el('div', {});
      body.appendChild(el('div', { className: 'sch-modal-meta' },
        components.statusBadge(g.status),
        el('span', { className: 'sch-modal-time' },
          fmt.timeRange(g.startTime, g.endTime) + ' · ' + fmt.lessons(g.lessonCount))
      ));
      const line = (k, v) => el('div', { className: 'sch-modal-line' },
        el('span', { className: 'sch-modal-k' }, k), el('span', {}, v));
      body.appendChild(line(t('schWas'), g.teacherName));
      if (g.group && g.group !== '—') body.appendChild(line('Klass', g.group));
      body.appendChild(line(t('schSubject'), g.subject || '—'));

      if (g.status === 'filled') {
        body.appendChild(el('div', { className: 'sch-filled-note' },
          '✓ ' + t('statusFilled') + ' · ' + (g.filledBySubName || '')));
      } else {
        const subs = ['Erik Norén', 'Karin Holm', 'Lars Ek', 'Sara Lind', 'Tomas Vik'];
        const sel = el('select', { className: 'sch-assign-select' },
          el('option', { value: '' }, t('schAssignDemo')),
          ...subs.map(n => el('option', { value: n }, n)));
        sel.onchange = () => {
          if (sel.value) { close(); components.confirmToast(t('schAssignedDemo') + ' ' + sel.value, 'green'); }
        };
        body.appendChild(sel);
      }

      const close = components.modal({
        title: (g.group && g.group !== '—' ? g.group + ' ' : '') + (g.subject || ''),
        body: body,
        tag: t('schDemoTag'),
        buttons: [
          { label: t('schOnBoard'), primary: true, onClick: () => ctx.setTab('board') },
          { label: t('close') },
        ],
      });
    }

    function legendItem(cls, label) {
      return el('span', { className: 'sch-legend-item' },
        el('span', { className: 'sch-legend-sw ' + cls }), label);
    }

    function render() {
      container.innerHTML = '';
      const gaps = gapsForDate(date);
      const idx = dates.indexOf(date);

      // Toolbar — date stepper (left) + layout control (right)
      const dateStepper = el('div', { className: 'sch-date' },
        el('button', {
          className: 'btn btn-ghost-border btn-sm', disabled: idx <= 0 ? 'true' : null,
          onclick: () => { if (idx > 0) { date = dates[idx - 1]; render(); } },
        }, '◂'),
        el('span', { className: 'sch-date-label' }, fmt.dateLong(date)),
        el('button', {
          className: 'btn btn-ghost-border btn-sm', disabled: idx >= dates.length - 1 ? 'true' : null,
          onclick: () => { if (idx < dates.length - 1) { date = dates[idx + 1]; render(); } },
        }, '▸')
      );
      const layoutCtl = components.segmentedControl(
        [
          { value: 'teacher', label: t('schByTeacher') },
          { value: 'day', label: t('schWholeDay') },
          { value: 'class', label: t('schByClass') },
        ],
        layout, v => { layout = v; render(); }
      );
      container.appendChild(el('div', { className: 'sch-toolbar' }, dateStepper, layoutCtl));

      // Legend
      container.appendChild(el('div', { className: 'sch-legend' },
        legendItem('is-unsent', t('schNeedsCover')),
        legendItem('is-pool', t('schInProgress')),
        legendItem('is-filled', t('statusFilled')),
        legendItem('is-expired', t('statusExpired'))
      ));

      if (gaps.length === 0) {
        container.appendChild(components.emptyState('◎', t('schNoGaps')));
        return;
      }

      // Day bounds, snapped to the hour
      let lo = Infinity, hi = -Infinity;
      gaps.forEach(g => { lo = Math.min(lo, toMin(g.startTime)); hi = Math.max(hi, toMin(g.endTime)); });
      const dayStart = Math.floor(lo / 60) * 60;
      const dayEnd = Math.ceil(hi / 60) * 60;
      const bodyH = (dayEnd - dayStart) * PX_PER_MIN;

      const board = el('div', { className: 'sch-board' });

      // Time gutter
      const gutter = el('div', { className: 'sch-gutter' });
      gutter.appendChild(el('div', { className: 'sch-colhead' }));
      const gbody = el('div', { className: 'sch-gutter-body', style: 'height:' + bodyH + 'px' });
      for (let m = dayStart; m <= dayEnd; m += 60) {
        gbody.appendChild(el('div', {
          className: 'sch-hour', style: 'top:' + ((m - dayStart) * PX_PER_MIN - 7) + 'px',
        }, pad(Math.floor(m / 60)) + ':00'));
      }
      gutter.appendChild(gbody);
      board.appendChild(gutter);

      // Columns
      const cols = columnsFor(gaps);
      cols.forEach(col => {
        const packed = packLanes(col.items);
        const cw = COL_W[layout];
        const colEl = el('div', { className: 'sch-col', style: 'width:' + cw + 'px' });
        colEl.appendChild(el('div', { className: 'sch-colhead', title: col.label }, col.label));
        const cbody = el('div', { className: 'sch-colbody', style: 'height:' + bodyH + 'px' });
        col.items.forEach(g => {
          const s = toMin(g.startTime), e = toMin(g.endTime);
          const st = STATUS[g.status] || STATUS.open_unsent;
          const w = (cw - 4) / packed.count;
          const ln = packed.lane[g.id] || 0;
          const line2 = g.status === 'filled' ? '✓ ' + (g.filledBySubName || '')
            : layout === 'teacher' ? fmt.timeRange(g.startTime, g.endTime)
              : g.teacherName;
          const block = el('div', {
            className: 'sch-block ' + st.cls,
            style: 'top:' + ((s - dayStart) * PX_PER_MIN) + 'px;height:' + ((e - s) * PX_PER_MIN - 2)
              + 'px;left:' + (2 + ln * w) + 'px;width:' + (w - 2) + 'px',
            title: (g.group && g.group !== '—' ? g.group + ' ' : '') + g.subject + ' · ' + fmt.timeRange(g.startTime, g.endTime),
            onclick: () => openGap(g),
          },
            el('div', { className: 'sch-block-t' },
              layout === 'class' ? g.subject : ((g.group && g.group !== '—' ? g.group + ' ' : '') + g.subject)),
            el('div', { className: 'sch-block-s' }, line2)
          );
          cbody.appendChild(block);
        });
        colEl.appendChild(cbody);
        board.appendChild(colEl);
      });

      // "now" line when viewing the simulated today
      if (date === todayIso) {
        const nowMin = Math.round((Adapter.now() - new Date(date + 'T00:00:00').getTime()) / 60000);
        if (nowMin >= dayStart && nowMin <= dayEnd) {
          board.appendChild(el('div', {
            className: 'sch-now', style: 'top:' + (HEADER_H + (nowMin - dayStart) * PX_PER_MIN) + 'px',
          }, el('span', { className: 'sch-now-label' }, t('now') + ' ' + pad(Math.floor(nowMin / 60)) + ':' + pad(nowMin % 60))));
        }
      }

      container.appendChild(el('div', { className: 'sch-scroll' }, board));
    }

    render();
  };
}());
