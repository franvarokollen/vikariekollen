// ============================================================
// ADAPTER — THE ENTIRE DATA + BUSINESS-LOGIC LAYER.
// REPLACE THIS FILE WHEN INTEGRATING WITH THE REAL
// VIKARIEKOLLEN / FRÅNVAROKOLLEN SUPABASE BACKEND.
//
// The UI (app.js + every view in views/*.js) calls
// window.Adapter.* ONLY — it never touches localStorage,
// sessionStorage, Supabase, or any network directly. To go
// live, reimplement the functions below against the schema in
// vikariekollen_schema.sql (cover_offers, cover_offer_targets,
// external_subs, staff_members, sub_activations, cover_records,
// absence_periods, partial_absence_slots, cover_assignments,
// lessons, school_settings) and the RPCs accept_cover_offer /
// decline_cover_offer / admin_assign_cover / match_cover_candidates.
//
// ── POLYMORPHIC RECIPIENT MODEL (internal staff + external subs) ──
// A cover offer can target EXTERNAL SUBS *and* INTERNAL STAFF through
// one mechanism. Each cover_offer_target carries:
//     recipient_type ∈ {'external_sub','staff'}  +  recipient_id
// (replacing the old external-only `sub_id`). A read-compat `subId`
// getter is preserved on every target object so any legacy reader
// keeps working, but recipient_type/recipient_id are CANONICAL. All
// lifecycle code (sendOffer / simulateResponse / adminAssign /
// cancelOffer / accept / decline / tickCascade) keys off the
// polymorphic pair.
//
// ── ASYNC NOTE (read before integrating) ─────────────────────
// All Adapter functions are SYNCHRONOUS in this prototype
// (localStorage is sync). At integration most will become async
// (return Promises against Supabase). When that happens, `await`
// them at every call site in app.js / views — that is the only
// permitted change to the UI files. Write call sites so that
// turning a `const x = Adapter.foo()` into `const x = await
// Adapter.foo()` is mechanical.
//
// ── SIMULATED CLOCK (important for cascade + audit) ──────────
// Business-logic timestamps use Adapter.now() — a SIMULATED clock
// seeded from a fixed base date (BASE_NOW). We never call
// Date.now() for deterministic demo logic (cascade step expiry,
// time-to-fill analytics). The dev can advance it with
// Adapter.advanceClock(minutes), which moves the simulated now
// forward and runs tickCascade(). Wall-clock Date.now() is only
// used for the human-readable audit-log display timestamp.
//
// ── SLOT-KEY FORMAT (reused from the sibling module) ─────────
// Availability slot keys are "<dayIndex>-<hour>", e.g. "0-8" =
// Monday 08:00. dayIndex is 0-based into getSchedule().days;
// hour is the integer start hour. A week's availability is an
// array of slot keys. Override presence is detected by ROW
// EXISTENCE (key !== null), NOT by array length — an empty
// override [] means "available zero hours this week", which is a
// real choice and must NOT fall through to the default.
//
// ── localStorage namespace ───────────────────────────────────
// All keys are prefixed vk_*. A single root document
// (VK_STORE_KEY) holds the mutable store; auxiliary keys hold UI
// prefs (vk_tab, vk_lang, vk_role) and the session (vk_user).
// The seed loads ONCE if the store is empty, then every edit /
// addition / state change is persisted and survives reload.
// Adapter.resetDemo() reseeds from scratch.
//
// ── PLUGIN SEAM (hot-swap: plugged_in vs standalone) ─────────
// Vikariekollen is a PLUGIN. It runs in one of two modes, read via
// Adapter.getPluginMode() / set via Adapter.setPluginMode(mode) and
// persisted under vk_plugin_mode. DEFAULT 'standalone' for this mock.
//
//   'standalone'  — VK is ISOLATED. Every data function reads/writes
//                   the LOCAL mock store (the seed in makeSeed()):
//                   subs, staff, schedules, activations, absences,
//                   school settings, subjects — all local. This is the
//                   mode the demo ships in; nothing depends on FVK.
//   'plugged_in'  — VK is PLUGGED INTO Frånvarokollen and FVK is the
//                   system of record. In a real build the data-source
//                   functions (listSubs / listStaff / staff schedules /
//                   activations / absence→gap feed / getSchoolSettings /
//                   listSubjects) would PROXY FVK instead of the local
//                   store — same return shapes, FVK-backed. VK-owned
//                   concepts (offers, targets, cascade, assignments,
//                   analytics, the subjects store if FVK has none) stay
//                   local or write back to FVK via its RPCs.
//
// THE ADAPTER IS THE SWAP BOUNDARY. The UI never branches on mode for
// data; it only READS the flag to show status ("Plugged into FVK" vs
// "Standalone demo"). This mock does NOT implement a real FVK proxy —
// it only establishes the flag + documents the contract so the UI has a
// status to show and future wiring has one defined seam to fill in
// (replace the bodies of the data-source functions when mode is
// 'plugged_in'; everything else already keys off Adapter.*).
// ============================================================

(function () {
  'use strict';

  // ----------------------------------------------------------
  // STORAGE KEYS (all vk_*)
  // ----------------------------------------------------------
  const VK_STORE_KEY = 'vk_store_v1';   // the whole mutable store
  const SESSION_KEY  = 'vk_user';       // logged-in user (sessionStorage)
  const LANG_KEY     = 'vk_lang';
  const ROLE_KEY     = 'vk_role';
  const TAB_KEY      = 'vk_tab';
  const SUBJECTS_KEY = 'vk_subjects';     // per-school subjects store (mutable)
  const PLUGIN_KEY   = 'vk_plugin_mode';  // 'standalone' | 'plugged_in'

  // Simulated "now" base — a fixed Wednesday in the demo week
  // (2026-W26, Wed 24 Jun 09:00 local). All deterministic business
  // timestamps are offsets from this; advanceClock() moves it.
  const BASE_NOW = new Date('2026-06-24T09:00:00').getTime();

  // ----------------------------------------------------------
  // SCHEDULE — grid dimensions (mirrors the sibling module)
  // ----------------------------------------------------------
  const SCHEDULE = {
    days:  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    hours: [8, 9, 10, 11, 12, 13, 14, 15],
  };
  const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ----------------------------------------------------------
  // SUBJECTS MODEL — canonical, per-school, MUTABLE.
  // ----------------------------------------------------------
  // Two kinds of entry, both stored as { name, type }:
  //   type 'teaching' — a curriculum subject. A gap in this subject
  //                     REQUIRES qualification: a candidate is `qualified`
  //                     iff their subjects[] include the gap subject.
  //   type 'duty'     — a NON-TEACHING DUTY (break/lunch supervision,
  //                     study support, etc.). A gap whose subject matches
  //                     a duty entry requires NO qualification — EVERYONE
  //                     is qualified for it.
  // The matcher reads the LIVE store (vk_subjects), so adding a subject/
  // duty in settings immediately changes qualification + duty detection.
  //
  // Seed note: a few legacy seed records use short subject forms
  // ('Idrott', 'Hälsa', 'NO', 'Historia', 'Samhälle'). They are included
  // in the canonical teaching list below so existing seeded subs/gaps stay
  // valid (their subjects[] still resolve to a known teaching subject).
  const CANONICAL_TEACHING = [
    'Matematik', 'Svenska', 'Svenska som andraspråk', 'Engelska',
    'Moderna språk', 'NO', 'Fysik', 'Kemi', 'Biologi', 'SO', 'Historia',
    'Geografi', 'Religionskunskap', 'Samhällskunskap', 'Teknik',
    'Idrott och hälsa', 'Musik', 'Bild', 'Slöjd',
    'Hem- och konsumentkunskap',
    // seed-compat short forms (kept so existing seed data resolves)
    'Idrott', 'Hälsa', 'Samhälle',
  ];
  const CANONICAL_DUTIES = [
    'Rastvakt', 'Lunchvakt', 'Studiehandledning',
    'Specialpedagogik-stöd', 'Fritids',
  ];
  function _canonicalSubjects() {
    return [
      ...CANONICAL_TEACHING.map(name => ({ name, type: 'teaching' })),
      ...CANONICAL_DUTIES.map(name => ({ name, type: 'duty' })),
    ];
  }

  // ----------------------------------------------------------
  // ISO 8601 WEEK HELPERS (reused verbatim from sibling)
  // ----------------------------------------------------------
  function _isoWeekData(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayOfWeek = d.getUTCDay();
    const isoDay = (dayOfWeek + 6) % 7;
    d.setUTCDate(d.getUTCDate() + (3 - isoDay));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNum };
  }

  function _mondayOfWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const isoDay = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - isoDay);
    return d;
  }

  function _mondayFromWeekId(weekId) {
    const m = weekId.match(/^(\d{4})-W(\d{2})$/);
    if (!m) throw new Error('Invalid weekId: ' + weekId);
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday1 = _mondayOfWeek(jan4);
    const targetMonday = new Date(monday1);
    targetMonday.setUTCDate(monday1.getUTCDate() + (week - 1) * 7);
    return targetMonday;
  }

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];

  // dayIndex (0=Mon..6=Sun) for an ISO date string "YYYY-MM-DD"
  function _dayIndexOf(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    return (d.getDay() + 6) % 7;
  }

  // weekId for an ISO date string
  function _weekIdOf(isoDate) {
    const { year, week } = _isoWeekData(new Date(isoDate + 'T00:00:00'));
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  // "HH:MM" → minutes since midnight
  function _toMin(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  // Two [start,end) ranges overlap?
  function _overlaps(aStart, aEnd, bStart, bEnd) {
    return _toMin(aStart) < _toMin(bEnd) && _toMin(bStart) < _toMin(aEnd);
  }

  // The set of hour slots "<dayIndex>-<hour>" a gap touches.
  // A gap touches hour H iff [startMin,endMin) overlaps [H*60,(H+1)*60).
  // Using lastH = floor((endMin-1)/60) makes an exact-hour end (12:00) stop
  // at the previous hour (it doesn't use the 12:00 block), while a 12:10 end
  // correctly includes hour 12 (it really does run into that block).
  function _gapSlots(gap) {
    const di = _dayIndexOf(gap.date);
    const startMin = _toMin(gap.startTime);
    const endMin   = _toMin(gap.endTime);
    const startH = Math.floor(startMin / 60);
    const lastH  = Math.floor((endMin - 1) / 60); // last hour actually used
    const slots = [];
    for (let h = startH; h <= lastH; h++) slots.push(`${di}-${h}`);
    return slots;
  }

  // ----------------------------------------------------------
  // ID + UUID-ish helpers (deterministic-ish, fine for demo)
  // ----------------------------------------------------------
  let _idCounter = 1;
  function _uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${(_idCounter++).toString(36)}`;
  }
  function _token() {
    // pseudo response_token; real backend uses gen_random_uuid()
    return 'tok-' + Math.random().toString(36).slice(2, 12);
  }

  function _initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2)
               .map(w => w.charAt(0).toUpperCase()).join('');
  }

  // ----------------------------------------------------------
  // SIMULATED CLOCK
  // ----------------------------------------------------------
  // _store.clockOffsetMin is persisted so the advanced clock survives reload.
  function _simNow() {
    return BASE_NOW + (_store.clockOffsetMin || 0) * 60000;
  }
  function _simIso() {
    return new Date(_simNow()).toISOString();
  }

  // ----------------------------------------------------------
  // SEED FACTORY — fresh deep copy of the demo world on each call.
  // Loads ONCE if the store is empty; then fully mutable + persisted.
  // ----------------------------------------------------------
  function makeSeed() {
    // Demo week is 2026-W26. Monday = 2026-06-22.
    // Activation/gap dates land Mon..Thu of that week.
    const subjectsPool = {
      'sub-1':  ['Matematik', 'Fysik'],
      'sub-2':  ['Matematik'],
      'sub-3':  ['Matematik', 'Kemi'],
      'sub-4':  ['Engelska', 'Svenska'],
      'sub-5':  ['Engelska'],
      'sub-6':  ['Engelska', 'Historia'],
      'sub-7':  ['Biologi', 'Kemi'],
      'sub-8':  ['Biologi', 'NO'],
      'sub-9':  ['Idrott', 'Hälsa'],
      'sub-10': ['Slöjd', 'Bild'],
    };

    // origin: where the sub record was created — 'fvk' (Frånvarokollen) or
    //   'vk' (created inside Vikariekollen). active: the FVK activate toggle.
    // The FOUR contactable pools are SLICES over (source + origin + active):
    //   internal_staff = staff_members
    //   fvk_active     = origin 'fvk' & active true
    //   vk_subs        = origin 'vk'   (treated active by default)
    //   fvk_inactive   = origin 'fvk' & active false
    // Seed mix: ~4 fvk+active, ~2 fvk+inactive, ~2 vk, so all four pools
    // are populated and the tier board/editor is interesting out of the box.
    const subs = [
      { id: 'sub-1',  name: 'Erik Karlsson',  email: 'erik.karlsson@vik.se',  phone: '+46701000001', subjects: subjectsPool['sub-1'],  hourlyRate: 320, origin: 'fvk', active: true,  notes: 'Föredrar förmiddag.' },
      { id: 'sub-2',  name: 'Johan Berg',     email: 'johan.berg@vik.se',     phone: '+46701000002', subjects: subjectsPool['sub-2'],  hourlyRate: 310, origin: 'fvk', active: true,  notes: '' },
      { id: 'sub-3',  name: 'Sofia Nyström',  email: 'sofia.nystrom@vik.se',  phone: '+46701000003', subjects: subjectsPool['sub-3'],  hourlyRate: 295, origin: 'fvk', active: true,  notes: 'Behörig gymnasiet.' },
      { id: 'sub-4',  name: 'Maria Olsson',   email: 'maria.olsson@vik.se',   phone: '+46701000004', subjects: subjectsPool['sub-4'],  hourlyRate: 300, origin: 'vk',  active: true,  notes: '' },
      { id: 'sub-5',  name: 'Lars Lindberg',  email: 'lars.lindberg@vik.se',  phone: '+46701000005', subjects: subjectsPool['sub-5'],  hourlyRate: 280, origin: 'vk',  active: true,  notes: '' },
      { id: 'sub-6',  name: 'Anna Björk',     email: 'anna.bjork@vik.se',     phone: '+46701000006', subjects: subjectsPool['sub-6'],  hourlyRate: 290, origin: 'fvk', active: false, notes: 'Endast tis/tors. Inaktiv FVK.' },
      { id: 'sub-7',  name: 'Peter Holm',     email: 'peter.holm@vik.se',     phone: '+46701000007', subjects: subjectsPool['sub-7'],  hourlyRate: 315, origin: 'fvk', active: true,  notes: '' },
      { id: 'sub-8',  name: 'Sara Lindqvist', email: 'sara.lindqvist@vik.se', phone: '+46701000008', subjects: subjectsPool['sub-8'],  hourlyRate: 285, origin: 'fvk', active: true,  notes: '' },
      { id: 'sub-9',  name: 'Lars Ek',        email: 'lars.ek@vik.se',        phone: '+46701000009', subjects: subjectsPool['sub-9'],  hourlyRate: 305, origin: 'fvk', active: true,  notes: 'Idrottslärare i grunden.' },
      { id: 'sub-10', name: 'Lena Persson',   email: 'lena.persson@vik.se',   phone: '+46701000010', subjects: subjectsPool['sub-10'], hourlyRate: 270, origin: 'fvk', active: false, notes: 'Pausad tills vidare.' },
    ].map(s => ({ ...s, initials: _initials(s.name) }));

    // ----------------------------------------------------------
    // INTERNAL STAFF — cover candidates that live INSIDE the school.
    // Sourced from FVK's staff_members {id, school_id, staff_code,
    // display_name, email, role[teaching|coverable|structural|
    // non-teaching], contract_pct}. We extend each with the demo
    // fields the matcher needs: subjects[], an internal hourly cost
    // (lower than externals, or 0 for salaried-no-extra), a weekly
    // teaching schedule (so FREE PERIODS can be computed), and a
    // monthly cover limit. role 'teaching'/'coverable' are eligible
    // to cover; 'structural'/'non-teaching' are not.
    // ----------------------------------------------------------
    const staffMembers = [
      { id: 'staff-1', staffCode: 'P01', displayName: 'Karin Holm',      email: 'karin.holm@skola.se',      role: 'coverable', contractPct: 100, subjects: ['Matematik','Fysik'],   internalRate: 0,   coverLimit: 8 },
      { id: 'staff-2', staffCode: 'P02', displayName: 'Mikael Strand',   email: 'mikael.strand@skola.se',   role: 'teaching',  contractPct: 80,  subjects: ['Engelska','Svenska'],   internalRate: 0,   coverLimit: 6 },
      { id: 'staff-3', staffCode: 'P03', displayName: 'Elin Sandberg',   email: 'elin.sandberg@skola.se',   role: 'teaching',  contractPct: 100, subjects: ['Biologi','Kemi','NO'],   internalRate: 0,   coverLimit: 8 },
      { id: 'staff-4', staffCode: 'P04', displayName: 'Oskar Lund',      email: 'oskar.lund@skola.se',      role: 'coverable', contractPct: 60,  subjects: ['Idrott','Hälsa'],       internalRate: 0,   coverLimit: 5 },
      { id: 'staff-5', staffCode: 'P05', displayName: 'Johanna Ek',      email: 'johanna.ek@skola.se',      role: 'teaching',  contractPct: 100, subjects: ['Historia','Samhälle'],   internalRate: 0,   coverLimit: 8 },
      { id: 'staff-6', staffCode: 'P06', displayName: 'Daniel Frost',    email: 'daniel.frost@skola.se',    role: 'coverable', contractPct: 75,  subjects: ['Matematik','NO'],       internalRate: 0,   coverLimit: 6 },
      { id: 'staff-7', staffCode: 'P07', displayName: 'Sara Wik',        email: 'sara.wik@skola.se',        role: 'teaching',  contractPct: 50,  subjects: ['Bild','Slöjd'],         internalRate: 0,   coverLimit: 4 },
      // a structural/non-teaching member — never a cover candidate
      { id: 'staff-8', staffCode: 'P08', displayName: 'Bengt Ahl',       email: 'bengt.ahl@skola.se',       role: 'structural', contractPct: 100, subjects: [],                       internalRate: 0,   coverLimit: 0 },
    ].map(m => ({ ...m, initials: _initials(m.displayName) }));

    // Staff teaching schedules — keyed by staffId → array of lessons
    // they teach: { date, startTime, endTime }. A staff member is
    // FREE for a gap iff none of these lessons overlaps the gap's time.
    // Deliberately leave each coverable member with open windows
    // around the demo gaps; staff-3 is busy at gap-2's slot so the
    // free-period rule has a visible effect.
    const staffSchedules = {
      'staff-1': [
        { date: '2026-06-24', startTime: '10:25', endTime: '12:10' }, // busy gap-2 slot, free gap-1
        { date: '2026-06-25', startTime: '08:20', endTime: '10:05' },
      ],
      'staff-2': [
        { date: '2026-06-24', startTime: '08:20', endTime: '10:05' }, // busy gap-1 slot, free gap-2
        { date: '2026-06-23', startTime: '13:10', endTime: '14:55' },
      ],
      'staff-3': [
        { date: '2026-06-24', startTime: '10:25', endTime: '12:10' }, // busy at gap-2 → NOT a candidate for gap-2
        { date: '2026-06-25', startTime: '08:20', endTime: '10:05' }, // free at gap-3 (13:10)
      ],
      'staff-4': [
        { date: '2026-06-23', startTime: '08:20', endTime: '09:10' }, // free gap-4 (09:15)
        { date: '2026-06-24', startTime: '13:10', endTime: '14:55' },
      ],
      'staff-5': [
        { date: '2026-06-24', startTime: '13:10', endTime: '14:55' }, // free both demo morning gaps
        { date: '2026-06-25', startTime: '10:25', endTime: '12:10' }, // free gap-3 (13:10)
      ],
      'staff-6': [
        { date: '2026-06-24', startTime: '08:20', endTime: '09:10' }, // free gap-1 ends 10:05? overlaps → busy gap-1
        { date: '2026-06-25', startTime: '08:20', endTime: '10:05' },
      ],
      'staff-7': [
        { date: '2026-06-22', startTime: '10:25', endTime: '12:10' },
      ],
      'staff-8': [],
    };

    // Default weekly availability per sub: arrays of "<dayIndex>-<hour>".
    // Most subs available mornings Mon–Fri 8–12; a few wider/narrower.
    function band(days, hours) {
      const out = [];
      days.forEach(d => hours.forEach(h => out.push(`${d}-${h}`)));
      return out;
    }
    const allDays = [0, 1, 2, 3, 4];
    const defaultAvailability = {
      'sub-1':  band(allDays, [8, 9, 10, 11, 12]),
      'sub-2':  band(allDays, [8, 9, 10, 11, 12, 13, 14]),
      'sub-3':  band([1, 3], [8, 9, 10, 11, 12, 13, 14, 15]),
      'sub-4':  band(allDays, [9, 10, 11, 12, 13]),
      'sub-5':  band(allDays, [8, 9, 10, 11, 12, 13]),
      'sub-6':  band([1, 2, 3], [8, 9, 10, 11, 12, 13]),
      'sub-7':  band(allDays, [10, 11, 12, 13, 14, 15]),
      'sub-8':  band(allDays, [8, 9, 10, 11, 12, 13, 14, 15]),
      'sub-9':  band(allDays, [8, 9, 10, 11, 12, 13]),
      'sub-10': band(allDays, [8, 9, 10, 11, 12, 13, 14, 15]),
    };

    // Per-week overrides: keyed "<subId>::<weekId>". Row presence = override.
    // Example: Sofia is away all of W26 (empty override → zero hours).
    const weekOverrides = {
      'sub-3::2026-W26': [],
    };

    // Activations for the demo week (which subs are "on" each date).
    // Keyed by ISO date → array of subIds.
    const activations = {
      '2026-06-22': ['sub-1','sub-2','sub-4','sub-5','sub-7','sub-8','sub-9'],
      '2026-06-23': ['sub-1','sub-2','sub-4','sub-6','sub-7','sub-8','sub-9'],
      '2026-06-24': ['sub-1','sub-2','sub-4','sub-5','sub-6','sub-7','sub-8','sub-9'],
      '2026-06-25': ['sub-1','sub-2','sub-4','sub-5','sub-7','sub-8','sub-9'],
    };

    // Lessons — period context for gaps + future lesson-plan attach.
    const lessons = [
      { id: 'les-1', date: '2026-06-24', subject: 'Matematik', group: '8B', startTime: '08:20', endTime: '10:05', teacherName: 'Anna Lindqvist', planUrl: null },
      { id: 'les-2', date: '2026-06-24', subject: 'Engelska',  group: '7A', startTime: '10:25', endTime: '12:10', teacherName: 'Per Magnusson',  planUrl: null },
      { id: 'les-3', date: '2026-06-25', subject: 'Biologi',   group: '9A', startTime: '13:10', endTime: '14:55', teacherName: 'Karin Svensson', planUrl: null },
      { id: 'les-4', date: '2026-06-23', subject: 'Idrott',    group: '9C', startTime: '09:15', endTime: '11:00', teacherName: 'Jonas Ek',       planUrl: null },
      { id: 'les-5', date: '2026-06-22', subject: 'Engelska',  group: '8A', startTime: '08:20', endTime: '10:05', teacherName: 'Petra Holm',     planUrl: null },
    ];

    // Gaps — a realistic week in mixed states.
    // gap-6 is seeded FILLED BY INTERNAL STAFF so savings analytics are
    // non-zero out of the box. filledByType records which pool filled it.
    const gaps = [
      { id: 'gap-1', teacherName: 'Anna Lindqvist', teacherInitials: 'AL', subject: 'Matematik', group: '8B', date: '2026-06-24', startTime: '08:20', endTime: '10:05', lessonCount: 2, periodIds: ['les-1'], status: 'cascade',     mode: 'cascade',      filledByType: null,           filledById: null,      filledBySubId: null,     filledBySubName: null },
      { id: 'gap-2', teacherName: 'Per Magnusson',  teacherInitials: 'PM', subject: 'Engelska',  group: '7A', date: '2026-06-24', startTime: '10:25', endTime: '12:10', lessonCount: 2, periodIds: ['les-2'], status: 'open_unsent', mode: 'cascade',      filledByType: null,           filledById: null,      filledBySubId: null,     filledBySubName: null },
      { id: 'gap-3', teacherName: 'Karin Svensson', teacherInitials: 'KS', subject: 'Biologi',   group: '9A', date: '2026-06-25', startTime: '13:10', endTime: '14:55', lessonCount: 2, periodIds: ['les-3'], status: 'open_pool',   mode: 'open_pool',    filledByType: null,           filledById: null,      filledBySubId: null,     filledBySubName: null },
      { id: 'gap-4', teacherName: 'Jonas Ek',       teacherInitials: 'JE', subject: 'Idrott',    group: '9C', date: '2026-06-23', startTime: '09:15', endTime: '11:00', lessonCount: 2, periodIds: ['les-4'], status: 'filled',      mode: 'admin_assign', filledByType: 'external_sub', filledById: 'sub-9',   filledBySubId: 'sub-9',  filledBySubName: 'Lars Ek' },
      { id: 'gap-5', teacherName: 'Petra Holm',     teacherInitials: 'PH', subject: 'Engelska',  group: '8A', date: '2026-06-22', startTime: '08:20', endTime: '10:05', lessonCount: 2, periodIds: ['les-5'], status: 'expired',     mode: 'cascade',      filledByType: null,           filledById: null,      filledBySubId: null,     filledBySubName: null },
      { id: 'gap-6', teacherName: 'Nils Berg',      teacherInitials: 'NB', subject: 'Historia',  group: '7B', date: '2026-06-22', startTime: '10:25', endTime: '12:10', lessonCount: 2, periodIds: [],        status: 'filled',      mode: 'admin_assign', filledByType: 'staff',        filledById: 'staff-5', filledBySubId: null,     filledBySubName: 'Johanna Ek' },
      // a NON-TEACHING DUTY gap (Rastvakt) — no subject qualification needed,
      // so every candidate matches as qualified:true.
      { id: 'gap-7', teacherName: 'Eva Strand',     teacherInitials: 'ES', subject: 'Rastvakt',  group: '—',  date: '2026-06-24', startTime: '13:10', endTime: '14:00', lessonCount: 1, periodIds: [],        status: 'open_unsent', mode: 'cascade',      filledByType: null,           filledById: null,      filledBySubId: null,     filledBySubName: null },
    ];

    // Offers + targets. One offer per gap that has been sent or filled.
    // Targets carry rank + state + token + timestamps.
    // gap-1: cascade mid-flight — rank1 contacted (awaiting), rest queued.
    // gap-3: open_pool — all contacted.
    // gap-4: filled via admin_assign — winner accepted, other superseded.
    // gap-5: expired cascade — all targets declined/expired (pool exhausted).
    // Targets carry the POLYMORPHIC pair recipientType/recipientId.
    // `subId` is kept ONLY on external targets as a read-compat alias.
    const baseSent = new Date(BASE_NOW - 30 * 60000).toISOString(); // 30 min before base
    const stepMin = 15;
    const ext = (id, fields) => ({ recipientType: 'external_sub', recipientId: id, subId: id, ...fields });
    const stf = (id, fields) => ({ recipientType: 'staff',        recipientId: id, subId: null, ...fields });
    const offers = [
      {
        // gap-1 cascade mid-flight: an internal staff member ranked first
        // (internal_first default), an external queued behind.
        id: 'offer-1', gapId: 'gap-1', mode: 'cascade',
        targets: [
          stf('staff-1', { rank: 1, state: 'contacted', responseToken: _token(), sentAt: baseSent, respondedAt: null, stepExpiresAt: new Date(BASE_NOW + 5 * 60000).toISOString() }),
          ext('sub-1',   { rank: 2, state: 'queued',    responseToken: _token(), sentAt: null,      respondedAt: null, stepExpiresAt: null }),
          ext('sub-2',   { rank: 3, state: 'queued',    responseToken: _token(), sentAt: null,      respondedAt: null, stepExpiresAt: null }),
        ],
      },
      {
        id: 'offer-3', gapId: 'gap-3', mode: 'open_pool',
        targets: [
          ext('sub-7', { rank: 1, state: 'contacted', responseToken: _token(), sentAt: baseSent, respondedAt: null, stepExpiresAt: null }),
          ext('sub-8', { rank: 2, state: 'contacted', responseToken: _token(), sentAt: baseSent, respondedAt: null, stepExpiresAt: null }),
        ],
      },
      {
        id: 'offer-4', gapId: 'gap-4', mode: 'admin_assign',
        targets: [
          ext('sub-9', { rank: 1, state: 'accepted', responseToken: _token(), sentAt: null, respondedAt: new Date(BASE_NOW - 86400000).toISOString(), stepExpiresAt: null }),
        ],
      },
      {
        id: 'offer-5', gapId: 'gap-5', mode: 'cascade',
        targets: [
          ext('sub-4', { rank: 1, state: 'declined', responseToken: _token(), sentAt: new Date(BASE_NOW - 2 * 86400000).toISOString(), respondedAt: new Date(BASE_NOW - 2 * 86400000 + 600000).toISOString(), stepExpiresAt: null }),
          ext('sub-5', { rank: 2, state: 'expired',  responseToken: _token(), sentAt: new Date(BASE_NOW - 2 * 86400000 + 700000).toISOString(), respondedAt: null, stepExpiresAt: new Date(BASE_NOW - 2 * 86400000 + 1600000).toISOString() }),
        ],
      },
      {
        // gap-6 filled by an INTERNAL staff member (admin_assign).
        id: 'offer-6', gapId: 'gap-6', mode: 'admin_assign',
        targets: [
          stf('staff-5', { rank: 1, state: 'accepted', responseToken: _token(), sentAt: null, respondedAt: new Date(BASE_NOW - 2 * 86400000).toISOString(), stepExpiresAt: null }),
        ],
      },
    ];

    // Assignments (write-back records) — one per filled gap.
    // recipientType/recipientId are canonical; subId kept for externals.
    // gap-4 external (Lars Ek @ 305/h × 2), gap-6 internal (Johanna Ek,
    // internal cost 0 but we record the external comparison rate so the
    // savings hook can compute "what an external would have cost").
    const assignments = [
      { id: 'asg-1', gapId: 'gap-4', date: '2026-06-23', recipientType: 'external_sub', recipientId: 'sub-9',   subId: 'sub-9', subName: 'Lars Ek',    subject: 'Idrott',   costSek: 305 * 2, externalComparableSek: 305 * 2, isExternal: true,  isConfirmed: true, assignedAt: new Date(BASE_NOW - 86400000).toISOString() },
      { id: 'asg-2', gapId: 'gap-6', date: '2026-06-22', recipientType: 'staff',        recipientId: 'staff-5', subId: null,    subName: 'Johanna Ek', subject: 'Historia', costSek: 0,       externalComparableSek: 300 * 2, isExternal: false, isConfirmed: true, assignedAt: new Date(BASE_NOW - 2 * 86400000).toISOString() },
    ];

    // Audit log — append-only lifecycle events. Drives reliabilityScore.
    // Seeded so scores come out varied and analytics are non-trivial.
    const auditLog = [
      { id: 'log-1',  ts: new Date(BASE_NOW - 5 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-1', subId: 'sub-1', detail: 'Accepted Matematik 7C' },
      { id: 'log-2',  ts: new Date(BASE_NOW - 4 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-2', subId: 'sub-1', detail: 'Accepted Fysik 9A' },
      { id: 'log-3',  ts: new Date(BASE_NOW - 3 * 86400000).toISOString(), type: 'offer_declined',  gapId: 'gap-old-3', subId: 'sub-2', detail: 'Declined Matematik 8A' },
      { id: 'log-4',  ts: new Date(BASE_NOW - 3 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-4', subId: 'sub-2', detail: 'Accepted Matematik 6B' },
      { id: 'log-5',  ts: new Date(BASE_NOW - 6 * 86400000).toISOString(), type: 'offer_no_response',gapId: 'gap-old-5', subId: 'sub-5', detail: 'No response Engelska 7B' },
      { id: 'log-6',  ts: new Date(BASE_NOW - 2 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-6', subId: 'sub-7', detail: 'Accepted Biologi 9B' },
      { id: 'log-7',  ts: new Date(BASE_NOW - 2 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-7', subId: 'sub-8', detail: 'Accepted Kemi 8C' },
      { id: 'log-8',  ts: new Date(BASE_NOW - 2 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-8', subId: 'sub-9', detail: 'Accepted Idrott 7A' },
      { id: 'log-9',  ts: new Date(BASE_NOW - 1 * 86400000).toISOString(), type: 'offer_declined',  gapId: 'gap-old-9', subId: 'sub-4', detail: 'Declined Svenska 9C' },
      { id: 'log-10', ts: new Date(BASE_NOW - 1 * 86400000).toISOString(), type: 'offer_accepted',  gapId: 'gap-old-10', subId: 'sub-7', detail: 'Accepted Biologi 8A' },
      // Demo-week events matching the seeded offers above
      { id: 'log-11', ts: baseSent, type: 'offer_sent',      gapId: 'gap-1', subId: null,    detail: 'Cascade started · Matematik 8B' },
      { id: 'log-12', ts: baseSent, type: 'target_contacted',gapId: 'gap-1', subId: 'sub-1', detail: 'Contacted rank 1' },
      { id: 'log-13', ts: baseSent, type: 'offer_sent',      gapId: 'gap-3', subId: null,    detail: 'Open pool started · Biologi 9A' },
      { id: 'log-14', ts: new Date(BASE_NOW - 86400000).toISOString(), type: 'admin_assigned', gapId: 'gap-4', subId: 'sub-9', detail: 'Admin assigned Lars Ek · Idrott 9C' },
      { id: 'log-15', ts: new Date(BASE_NOW - 2 * 86400000 + 600000).toISOString(), type: 'offer_declined', gapId: 'gap-5', subId: 'sub-4', detail: 'Declined Engelska 8A' },
      { id: 'log-16', ts: new Date(BASE_NOW - 2 * 86400000 + 1600000).toISOString(), type: 'target_expired', gapId: 'gap-5', subId: 'sub-5', detail: 'Step timeout' },
      { id: 'log-17', ts: new Date(BASE_NOW - 2 * 86400000 + 1700000).toISOString(), type: 'offer_expired', gapId: 'gap-5', subId: null, detail: 'Cascade exhausted · Engelska 8A' },
    ];

    // Enrich history with realistic offer_sent → resolution timelines so
    // analytics (avgMinutesToFill, declineRate) read like a real week of ops.
    // Each historical resolution gets a preceding offer_sent placed N minutes
    // earlier; the gap drives avgMinutesToFill, the extra sends drive declineRate.
    // ts of the matching resolution event - leadMinutes => offer_sent ts.
    const _resolutionTs = {
      'gap-old-1':  new Date(BASE_NOW - 5 * 86400000).getTime(),
      'gap-old-2':  new Date(BASE_NOW - 4 * 86400000).getTime(),
      'gap-old-3':  new Date(BASE_NOW - 3 * 86400000).getTime(),
      'gap-old-4':  new Date(BASE_NOW - 3 * 86400000).getTime(),
      'gap-old-5':  new Date(BASE_NOW - 6 * 86400000).getTime(),
      'gap-old-6':  new Date(BASE_NOW - 2 * 86400000).getTime(),
      'gap-old-7':  new Date(BASE_NOW - 2 * 86400000).getTime(),
      'gap-old-8':  new Date(BASE_NOW - 2 * 86400000).getTime(),
      'gap-old-9':  new Date(BASE_NOW - 1 * 86400000).getTime(),
      'gap-old-10': new Date(BASE_NOW - 1 * 86400000).getTime(),
      'gap-4':      new Date(BASE_NOW - 86400000).getTime(),
    };
    // leadMinutes per gap: filled gaps land 15–30 min; the no-response leads
    // longest (unanswered). Average of the filled set ≈ 23 min.
    const _leadMinutes = {
      'gap-old-1': 18, 'gap-old-2': 25, 'gap-old-3': 12, 'gap-old-4': 15,
      'gap-old-5': 40, 'gap-old-6': 22, 'gap-old-7': 30, 'gap-old-8': 20,
      'gap-old-9': 19, 'gap-old-10': 27, 'gap-4': 24,
    };
    let _seq = auditLog.length + 1;
    for (const gid of Object.keys(_resolutionTs)) {
      const sentTs = new Date(_resolutionTs[gid] - _leadMinutes[gid] * 60000).toISOString();
      auditLog.push({
        id: `log-${_seq++}`, ts: sentTs, type: 'offer_sent',
        gapId: gid, subId: null, detail: 'Offer sent (history)',
      });
    }

    return {
      schoolSettings: {
        // distribution method — HOW an offer is delivered once a pool is chosen
        coverOfferMode: 'cascade',
        // candidate-pool policy — legacy 5-value label, now DERIVED from the
        // tiers below (kept readable for any legacy reader).
        coverSourceMode: 'internal_first',
        // candidate-pool TIERS — the ORDERED, TOGGLEABLE source of truth the
        // matcher ranks by. Four pool keys; default puts staff first and
        // inactive FVK subs last + off. Mirrors DEFAULT_TIERS (inlined here
        // because makeSeed runs at module load before that const initializes).
        coverSourceTiers: [
          { key: 'internal_staff', enabled: true  },
          { key: 'fvk_active',     enabled: true  },
          { key: 'vk_subs',        enabled: true  },
          { key: 'fvk_inactive',   enabled: false },
        ],
        // automation policy — how much the system acts on its own (consumed later)
        automationLevel: 'assisted',
        stepMinutes: stepMin,
        channels: { sms: true, email: true },
        smsTemplate: 'Hej {namn}! Vikariepass {ämne} {datum} {tid} på {skola}. Svara JA eller NEJ: {länk}',
        emailTemplate: 'Hej {namn},\n\nDu erbjuds ett vikariepass i {ämne} ({grupp}) den {datum} kl {tid}.\nSvara via länken: {länk}\n\nVänliga hälsningar,\nVikariekollen',
      },
      subs,
      staffMembers,
      staffSchedules,
      defaultAvailability,
      weekOverrides,
      activations,
      lessons,
      gaps,
      offers,
      assignments,
      auditLog,
      clockOffsetMin: 0,
    };
  }

  // ----------------------------------------------------------
  // STORE LOAD / PERSIST
  // ----------------------------------------------------------
  let _store = _loadStore();

  function _loadStore() {
    try {
      const raw = localStorage.getItem(VK_STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* fall through to seed */ }
    const seed = makeSeed();
    try { localStorage.setItem(VK_STORE_KEY, JSON.stringify(seed)); } catch { /* ignore quota */ }
    return seed;
  }

  function _persist() {
    try { localStorage.setItem(VK_STORE_KEY, JSON.stringify(_store)); } catch { /* ignore quota */ }
  }

  // ----------------------------------------------------------
  // SUBJECTS STORE (vk_subjects) — separate persisted document, seeded
  // ONCE from the canonical list, then fully mutable. Kept out of the
  // main store so the subject list survives resetDemo()? No — we want a
  // demo reset to also restore subjects, so resetDemo() reseeds it too.
  // Each row is { name, type:'teaching'|'duty' }. Lookups are
  // case-insensitive on name.
  // ----------------------------------------------------------
  function _loadSubjects() {
    try {
      const raw = localStorage.getItem(SUBJECTS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          // normalize/repair stored rows
          const out = [];
          const seen = new Set();
          for (const r of arr) {
            if (!r || typeof r.name !== 'string') continue;
            const name = r.name.trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ name, type: r.type === 'duty' ? 'duty' : 'teaching' });
          }
          if (out.length) return out;
        }
      }
    } catch { /* fall through to canonical seed */ }
    const seed = _canonicalSubjects();
    try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(seed)); } catch { /* ignore quota */ }
    return seed;
  }

  let _subjects = _loadSubjects();

  function _persistSubjects() {
    try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(_subjects)); } catch { /* ignore quota */ }
  }

  // Find a subject row by name (case-insensitive). Returns the row or null.
  function _subjectRow(name) {
    if (typeof name !== 'string') return null;
    const key = name.trim().toLowerCase();
    return _subjects.find(s => s.name.toLowerCase() === key) || null;
  }

  // Is this gap subject a NON-TEACHING DUTY? (duty entry ⇒ no qualification)
  // A subject not present in the store at all is treated as a TEACHING
  // subject (qualification required) — only an explicit duty entry waives it.
  function _isDutySubject(subject) {
    const row = _subjectRow(subject);
    return !!row && row.type === 'duty';
  }

  // Does this gap require qualification? No subject, or a duty subject ⇒ no.
  function _gapRequiresQualification(gap) {
    if (!gap || !gap.subject) return false;
    return !_isDutySubject(gap.subject);
  }

  // Is a candidate qualified for the gap? True iff the gap requires no
  // qualification, OR the candidate's subjects[] include the gap subject.
  function _isQualified(candidateSubjects, gap) {
    if (!_gapRequiresQualification(gap)) return true;
    return Array.isArray(candidateSubjects) && candidateSubjects.includes(gap.subject);
  }

  // ----------------------------------------------------------
  // PLUGIN MODE (vk_plugin_mode) — see header "PLUGIN SEAM".
  // ----------------------------------------------------------
  const PLUGIN_MODES = ['standalone', 'plugged_in'];
  function _loadPluginMode() {
    try {
      const raw = localStorage.getItem(PLUGIN_KEY);
      if (raw && PLUGIN_MODES.includes(raw)) return raw;
    } catch { /* fall through */ }
    return 'standalone';
  }
  let _pluginMode = _loadPluginMode();

  // ----------------------------------------------------------
  // INTERNAL LOOKUPS
  // ----------------------------------------------------------
  function _gap(id)     { return _store.gaps.find(g => g.id === id) || null; }
  function _sub(id)     { return _store.subs.find(s => s.id === id) || null; }
  function _staff(id)   { return (_store.staffMembers || []).find(m => m.id === id) || null; }
  function _offerFor(gapId) { return _store.offers.find(o => o.gapId === gapId) || null; }
  function _lesson(id)  { return _store.lessons.find(l => l.id === id) || null; }

  // ----------------------------------------------------------
  // POLYMORPHIC TARGET HELPERS
  // A target's identity is (recipientType, recipientId). Legacy seed/
  // store rows may carry only `subId` (external). These helpers read
  // the canonical pair, falling back to subId for back-compat, and
  // build a fresh target with both the canonical fields and the
  // compat alias set correctly.
  // ----------------------------------------------------------
  function _tType(t) { return t.recipientType || 'external_sub'; }
  function _tId(t)   { return t.recipientId != null ? t.recipientId : t.subId; }
  // Does this target point at the given (type,id)?
  function _tMatch(t, type, id) { return _tType(t) === type && _tId(t) === id; }
  // The display record behind a target (sub OR staff member).
  function _recipientRecord(type, id) {
    return type === 'staff' ? _staff(id) : _sub(id);
  }
  function _recipientName(type, id) {
    const r = _recipientRecord(type, id);
    if (!r) return null;
    return type === 'staff' ? r.displayName : r.name;
  }
  // A roster of (type,id) pairs that are eligible cover SOURCES at all
  // (subs always; staff only in coverable/teaching roles).
  function _isCoverableStaff(m) {
    return m && (m.role === 'coverable' || m.role === 'teaching');
  }
  // ----------------------------------------------------------
  // COVER-SOURCE TIERS — the ORDERED, TOGGLEABLE pool config that is
  // now the SOURCE OF TRUTH for the matcher. Replaces the 5-value
  // coverSourceMode (kept derived/legacy). Four pool keys:
  //   internal_staff = staff_members (source 'internal')
  //   fvk_active     = external sub, origin 'fvk', active true
  //   vk_subs        = external sub, origin 'vk'   (active by default)
  //   fvk_inactive   = external sub, origin 'fvk', active false
  // DEFAULT order puts your own staff first, then active FVK subs, then
  // VK subs, with inactive FVK subs LAST and OFF (last-resort pool).
  // ----------------------------------------------------------
  const TIER_KEYS = ['internal_staff', 'fvk_active', 'vk_subs', 'fvk_inactive'];
  const DEFAULT_TIERS = [
    { key: 'internal_staff', enabled: true  },
    { key: 'fvk_active',     enabled: true  },
    { key: 'vk_subs',        enabled: true  },
    { key: 'fvk_inactive',   enabled: false },
  ];
  // Human pool labels (SV is the primary UI language; EN for builders).
  const TIER_LABELS = {
    internal_staff: { sv: 'Intern personal',      en: 'Internal staff'      },
    fvk_active:     { sv: 'Aktiv FVK-vikarie',    en: 'Active FVK sub'       },
    vk_subs:        { sv: 'VK-vikarie',           en: 'VK sub'               },
    fvk_inactive:   { sv: 'Inaktiv FVK-vikarie',  en: 'Inactive FVK sub'     },
  };
  function _poolLabel(tierKey) {
    return (TIER_LABELS[tierKey] && TIER_LABELS[tierKey].sv) || tierKey;
  }

  // The origin of a sub record, defaulting legacy rows (no origin) to 'fvk'
  // (the historical source). active defaults true for vk-origin subs.
  function _subOrigin(s) { return s && s.origin === 'vk' ? 'vk' : 'fvk'; }

  // Classify an external sub into its tier key from origin + active.
  function _subTier(s) {
    if (_subOrigin(s) === 'vk') return 'vk_subs';
    return s.active ? 'fvk_active' : 'fvk_inactive';
  }

  // Validate + normalize a tiers array. Returns the array or null.
  // Rules: an array of exactly the 4 keys, each once, no dupes/unknowns,
  // each with a boolean `enabled`.
  function _validateTiers(tiers) {
    if (!Array.isArray(tiers) || tiers.length !== TIER_KEYS.length) return null;
    const seen = new Set();
    const out = [];
    for (const t of tiers) {
      if (!t || typeof t !== 'object') return null;
      if (!TIER_KEYS.includes(t.key)) return null;
      if (seen.has(t.key)) return null;
      if (typeof t.enabled !== 'boolean') return null;
      seen.add(t.key);
      out.push({ key: t.key, enabled: t.enabled });
    }
    if (seen.size !== TIER_KEYS.length) return null;
    return out;
  }

  // Derive a best-effort legacy coverSourceMode label from a tier config so
  // any legacy reader still gets something sane. internal_staff is the
  // internal pool; the three sub pools are external.
  function _deriveCoverSourceMode(tiers) {
    const enabled = tiers.filter(t => t.enabled);
    const internalOn = enabled.some(t => t.key === 'internal_staff');
    const externalOn = enabled.some(t => t.key !== 'internal_staff');
    if (internalOn && !externalOn) return 'internal_only';
    if (externalOn && !internalOn) return 'external_only';
    if (!internalOn && !externalOn) return 'internal_only'; // degenerate: nothing on
    // both pools on — order decides. Index of internal vs the first external.
    const internalIdx = enabled.findIndex(t => t.key === 'internal_staff');
    const firstExtIdx = enabled.findIndex(t => t.key !== 'internal_staff');
    return internalIdx < firstExtIdx ? 'internal_first' : 'external_first';
  }

  // Migrate a legacy coverSourceMode → a tier config (for stored rows that
  // predate tiers). Preserves the spirit of the old 5-value mode.
  function _tiersFromMode(mode) {
    const on = (k) => true, off = (k) => false;
    const mk = (order, enabledFn) => order.map(key => ({ key, enabled: enabledFn(key) }));
    const extFirst = ['fvk_active', 'vk_subs', 'fvk_inactive'];
    switch (mode) {
      case 'internal_only':
        return mk(['internal_staff', ...extFirst], k => k === 'internal_staff');
      case 'external_only':
        return mk([...extFirst, 'internal_staff'],
                  k => k !== 'internal_staff' && k !== 'fvk_inactive');
      case 'external_first':
        return mk([...extFirst, 'internal_staff'], k => k !== 'fvk_inactive');
      case 'both':
        return mk(['internal_staff', ...extFirst], k => k !== 'fvk_inactive');
      case 'internal_first':
      default:
        return DEFAULT_TIERS.map(t => ({ ...t }));
    }
  }

  // Read the canonical tier config off the store, migrating/repairing as
  // needed (legacy row → derive from mode; invalid → default).
  function _effectiveTiers() {
    const ss = _store.schoolSettings || {};
    const valid = _validateTiers(ss.coverSourceTiers);
    if (valid) return valid;
    if (ss.coverSourceMode) return _tiersFromMode(ss.coverSourceMode);
    return DEFAULT_TIERS.map(t => ({ ...t }));
  }

  // Build a polymorphic target object with the compat alias.
  function _mkTarget(type, id, fields) {
    return {
      recipientType: type,
      recipientId: id,
      subId: type === 'external_sub' ? id : null,
      ...fields,
    };
  }

  // Audit entries keep `subId` for back-compat (external reliability
  // scoring still keys off it) AND the polymorphic recipientType/
  // recipientId so staff-side history can be reconstructed. For an
  // external recipient subId === recipientId; for staff subId is null.
  function _log(type, fields) {
    const rType = fields.recipientType || (fields.subId ? 'external_sub' : null);
    const rId   = fields.recipientId != null ? fields.recipientId : (fields.subId || null);
    _store.auditLog.push({
      id: _uid('log'),
      ts: _simIso(),
      wallTs: new Date().toISOString(),
      type,
      gapId: fields.gapId || null,
      recipientType: rType,
      recipientId: rId,
      subId: rType === 'external_sub' ? rId : (fields.subId || null),
      detail: fields.detail || '',
    });
  }

  // Effective availability slots for a sub in a given week (no source needed here)
  function _effectiveSlots(subId, weekId) {
    const key = `${subId}::${weekId}`;
    if (Object.prototype.hasOwnProperty.call(_store.weekOverrides, key)) {
      return _store.weekOverrides[key] || [];
    }
    return _store.defaultAvailability[subId] || [];
  }

  // Is the sub available for every hour-slot the gap touches?
  function _availableForGap(subId, gap) {
    const weekId = _weekIdOf(gap.date);
    const slots = new Set(_effectiveSlots(subId, weekId));
    return _gapSlots(gap).every(s => slots.has(s));
  }

  // Is the sub activated for that date?
  function _isActivated(subId, date) {
    return (_store.activations[date] || []).includes(subId);
  }

  // Does this recipient (sub OR staff) already have an overlapping
  // commitment that date? Checks confirmed assignments AND other live
  // (contacted/accepted) offer targets on overlapping-time gaps.
  // Polymorphic: keyed by (type, id). Returns a reason string or null.
  function _conflictFor(type, id, gap) {
    // confirmed assignments
    for (const a of _store.assignments) {
      if (a.date !== gap.date) continue;
      const aType = a.recipientType || 'external_sub';
      const aId   = a.recipientId != null ? a.recipientId : a.subId;
      if (aType !== type || aId !== id) continue;
      const ag = _gap(a.gapId);
      if (ag && _overlaps(gap.startTime, gap.endTime, ag.startTime, ag.endTime)) {
        return 'booked';
      }
    }
    // live offer targets elsewhere
    for (const o of _store.offers) {
      if (o.gapId === gap.id) continue;
      const og = _gap(o.gapId);
      if (!og || og.date !== gap.date) continue;
      if (!_overlaps(gap.startTime, gap.endTime, og.startTime, og.endTime)) continue;
      const tgt = o.targets.find(t => _tMatch(t, type, id));
      if (tgt && (tgt.state === 'contacted' || tgt.state === 'accepted')) {
        return tgt.state === 'accepted' ? 'booked' : 'pending_elsewhere';
      }
    }
    return null;
  }

  // ----------------------------------------------------------
  // STAFF FREE-PERIOD + WORKLOAD MODEL
  // ----------------------------------------------------------
  // A staff member has a FREE PERIOD at the gap iff none of their
  // seeded teaching lessons that date overlaps the gap's time window.
  function _staffFreeForGap(staffId, gap) {
    const sched = (_store.staffSchedules && _store.staffSchedules[staffId]) || [];
    for (const l of sched) {
      if (l.date !== gap.date) continue;
      if (_overlaps(gap.startTime, gap.endTime, l.startTime, l.endTime)) return false;
    }
    return true;
  }

  // How many covers a staff member has already taken in the gap's
  // calendar month (confirmed assignments + live accepted targets).
  function _staffCoversInMonth(staffId, refDateIso) {
    const ym = (refDateIso || _simIso()).slice(0, 7); // "YYYY-MM"
    let count = 0;
    for (const a of _store.assignments) {
      const aType = a.recipientType || 'external_sub';
      const aId   = a.recipientId != null ? a.recipientId : a.subId;
      if (aType === 'staff' && aId === staffId && (a.date || '').slice(0, 7) === ym) count++;
    }
    return count;
  }

  // Workload as a percent of the member's monthly cover limit.
  function _staffWorkloadPct(staffId, refDateIso) {
    const m = _staff(staffId);
    const limit = (m && m.coverLimit) || 0;
    if (!limit) return 0;
    return Math.min(100, Math.round((_staffCoversInMonth(staffId, refDateIso) / limit) * 100));
  }

  // Under the cover limit for the gap's month?
  function _staffUnderLimit(staffId, gap) {
    const m = _staff(staffId);
    if (!m) return false;
    const limit = m.coverLimit || 0;
    if (limit <= 0) return false;
    return _staffCoversInMonth(staffId, gap.date) < limit;
  }

  // Mean hourly rate across ACTIVE external subs — the comparison rate
  // used to value an internal cover (what an external would have cost).
  function _avgExternalRate() {
    const active = _store.subs.filter(s => s.active);
    if (!active.length) return 0;
    return Math.round(active.reduce((sum, s) => sum + (s.hourlyRate || 0), 0) / active.length);
  }

  // Live offers awaiting a response from a given recipient (sub OR staff).
  // Shared by getOffersForSub (external) and getRequestsForStaff (internal).
  function _offersForRecipient(type, id) {
    const out = [];
    for (const offer of _store.offers) {
      const tgt = offer.targets.find(t => _tMatch(t, type, id));
      if (!tgt) continue;
      if (!['contacted', 'sent', 'pending', 'queued'].includes(tgt.state)) continue;
      const gap = _gap(offer.gapId);
      if (!gap || gap.status === 'filled' || gap.status === 'expired') continue;
      out.push({
        gapId: gap.id,
        recipientType: type,
        recipientId: id,
        subId: type === 'external_sub' ? id : null,
        responseToken: tgt.responseToken,
        state: _candidateState(tgt.state),
        rank: tgt.rank,
        sentAt: tgt.sentAt || null,
        stepExpiresAt: tgt.stepExpiresAt || null,
        gap: { ...JSON.parse(JSON.stringify(gap)), status: _deriveGapStatus(gap) },
      });
    }
    out.sort((a, b) => (a.gap.date + a.gap.startTime).localeCompare(b.gap.date + b.gap.startTime));
    return out;
  }

  // Confirmed cover assignments for a given recipient, with gap + lessons.
  function _coversForRecipient(type, id) {
    return _store.assignments
      .filter(a => {
        const aType = a.recipientType || 'external_sub';
        const aId   = a.recipientId != null ? a.recipientId : a.subId;
        return aType === type && aId === id;
      })
      .map(a => {
        const gap = _gap(a.gapId);
        const lessons = gap && gap.periodIds
          ? gap.periodIds.map(pid => _lesson(pid)).filter(Boolean)
          : [];
        return {
          ...JSON.parse(JSON.stringify(a)),
          gap: gap ? { ...JSON.parse(JSON.stringify(gap)), status: _deriveGapStatus(gap) } : null,
          lessons,
        };
      })
      .sort((a, b) => (a.date).localeCompare(b.date));
  }

  // Reliability score derived from the audit log, polymorphic over
  // (type, id). base 50 + accepts*10 - declines*5 - noResponse*3,
  // clamped 0..100. Internal staff with no history start near base
  // (slightly above, since they're salaried colleagues already on
  // site) — we nudge staff with empty history to 60 so a brand-new
  // coverable colleague isn't ranked dead last by reliability alone.
  function _reliabilityScore(type, id) {
    // back-compat: _reliabilityScore('sub-1') still works (external)
    if (id === undefined) { id = type; type = 'external_sub'; }
    let accepts = 0, declines = 0, noResp = 0, seen = 0;
    for (const e of _store.auditLog) {
      const eType = e.recipientType || (e.subId ? 'external_sub' : null);
      const eId   = e.recipientId != null ? e.recipientId : e.subId;
      if (eType !== type || eId !== id) continue;
      if (e.type === 'offer_accepted')      { accepts++; seen++; }
      else if (e.type === 'offer_declined') { declines++; seen++; }
      else if (e.type === 'offer_no_response' || e.type === 'target_expired') { noResp++; seen++; }
    }
    if (type === 'staff' && seen === 0) return 60;
    const raw = 50 + accepts * 10 - declines * 5 - noResp * 3;
    return Math.max(0, Math.min(100, raw));
  }

  // Derive the UI status of a gap from its stored status + offer targets.
  // Stored status is authoritative for filled/expired; for 'open' family we
  // refine into open_unsent / cascade / open_pool from the offer.
  function _deriveGapStatus(gap) {
    if (gap.status === 'filled' || gap.status === 'expired') return gap.status;
    const offer = _offerFor(gap.id);
    if (!offer) return 'open_unsent';
    const anyLive = offer.targets.some(t => t.state === 'contacted' || t.state === 'queued' || t.state === 'sent');
    if (!anyLive) {
      // all declined/expired/superseded with no fill → unsent-equivalent (exhausted)
      return offer.mode === 'open_pool' ? 'open_pool' : 'cascade';
    }
    return offer.mode === 'open_pool' ? 'open_pool' : 'cascade';
  }

  // Map a target state to the candidate-facing state vocabulary.
  // Target states: pending|queued|contacted|sent|accepted|declined|superseded|expired
  // Candidate states: pending|queued|contacted|accepted|declined|superseded
  function _candidateState(targetState) {
    if (targetState === 'sent')    return 'contacted';
    if (targetState === 'expired') return 'declined';
    return targetState;
  }

  // ----------------------------------------------------------
  // CASCADE ENGINE
  // ----------------------------------------------------------
  // Advance any contacted target whose stepExpiresAt has passed (simulated
  // clock) to 'expired', then release the next queued target by rank.
  // Returns number of transitions made.
  function _tickCascade() {
    const now = _simNow();
    let changed = 0;
    for (const offer of _store.offers) {
      if (offer.mode !== 'cascade') continue;
      const gap = _gap(offer.gapId);
      if (!gap || gap.status !== 'open_unsent' && gap.status !== 'cascade') {
        // only live cascade gaps
        if (gap && (gap.status === 'filled' || gap.status === 'expired')) continue;
      }
      if (gap && (gap.status === 'filled' || gap.status === 'expired')) continue;

      const contacted = offer.targets.filter(t => t.state === 'contacted');
      for (const t of contacted) {
        if (t.stepExpiresAt && new Date(t.stepExpiresAt).getTime() <= now) {
          t.state = 'expired';
          t.respondedAt = _simIso();
          _log('target_expired', { gapId: gap.id, recipientType: _tType(t), recipientId: _tId(t), detail: 'Step timeout' });
          changed++;
          const released = _releaseNext(offer, gap);
          if (!released) {
            gap.status = 'expired';
            _log('offer_expired', { gapId: gap.id, detail: 'Cascade exhausted' });
          }
        }
      }
    }
    if (changed) _persist();
    return changed;
  }

  // Release the next queued target (lowest rank) → contacted. Returns true if released.
  function _releaseNext(offer, gap) {
    const next = offer.targets
      .filter(t => t.state === 'queued')
      .sort((a, b) => a.rank - b.rank)[0];
    if (!next) return false;
    next.state = 'contacted';
    next.sentAt = _simIso();
    next.stepExpiresAt = new Date(_simNow() + (_store.schoolSettings.stepMinutes || 15) * 60000).toISOString();
    _log('target_contacted', { gapId: gap.id, recipientType: _tType(next), recipientId: _tId(next), detail: 'Released rank ' + next.rank });
    return true;
  }

  // ----------------------------------------------------------
  // VALIDATION HELPERS
  // ----------------------------------------------------------
  function _requireStr(v, field) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`Invalid ${field}`);
    return v.trim();
  }

  // ----------------------------------------------------------
  // PUBLIC ADAPTER API
  // ----------------------------------------------------------
  window.Adapter = {

    // ======================================================
    // CLOCK
    // ======================================================
    now() { return _simNow(); },
    nowIso() { return _simIso(); },
    advanceClock(minutes) {
      const m = Number(minutes) || 0;
      _store.clockOffsetMin = (_store.clockOffsetMin || 0) + m;
      const transitions = _tickCascade();
      _persist();
      return { ok: true, now: _simIso(), transitions };
    },
    tickCascade() {
      const n = _tickCascade();
      return { ok: true, transitions: n };
    },

    // advanceCascade(gapId) — manually skip the timer and move to the next
    // queued candidate. Only valid when gap.status === 'cascade'.
    // Returns:
    //   { ok:true, released:true }           — next candidate promoted
    //   { ok:true, released:false, exhausted:true } — pool dry, no more queued
    //   { ok:false, error }                  — precondition failed
    // Reuses _releaseNext (same transition as a natural timeout in _tickCascade).
    advanceCascade(gapId) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      if (_deriveGapStatus(gap) !== 'cascade') {
        return { ok: false, error: 'Gap is not in cascade status' };
      }
      const offer = _offerFor(gapId);
      if (!offer || offer.mode !== 'cascade') {
        return { ok: false, error: 'No cascade offer for this gap' };
      }

      // Find and expire the current contacted target.
      const contacted = offer.targets.find(t => t.state === 'contacted');
      if (contacted) {
        const heldMs = contacted.sentAt
          ? (_simNow() - new Date(contacted.sentAt).getTime())
          : 0;
        const heldMin = Math.round(heldMs / 60000);
        contacted.state = 'expired';
        contacted.respondedAt = _simIso();
        _log('target_expired', {
          gapId,
          recipientType: _tType(contacted),
          recipientId: _tId(contacted),
          detail: `Manually advanced to next candidate (held ${heldMin} min)`,
        });
      }

      // Release next queued → contacted (reuses the shared helper).
      const released = _releaseNext(offer, gap);
      if (!released) {
        gap.status = 'expired';
        _log('offer_expired', { gapId, detail: 'Cascade pool exhausted' });
        _persist();
        return { ok: true, released: false, exhausted: true };
      }

      _persist();
      return { ok: true, released: true };
    },

    // ======================================================
    // AUTH  (roles: 'coordinator' | 'sub' | 'staff')
    //   coordinator → school control plane (board/pool/settings/history)
    //   sub         → external substitute self-service (subId set)
    //   staff       → internal staff member self-service (staffId set)
    // getCurrentUser() returns {email,name,role,subId|null,staffId|null}.
    // ======================================================
    getCurrentUser() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },

    // login(email, code, role) — demo bypass. Resolves the role and,
    // for sub/staff, the backing record by email (else a demo default).
    login(email, _code, role) {
      const identifier = (email && email.trim()) || 'demo@vikariekollen.se';
      const useRole = role || this.getRole();
      let user;
      if (useRole === 'sub') {
        // resolve to a substitute by email; fall back to first sub for demo
        const match = _store.subs.find(s => s.email.toLowerCase() === identifier.toLowerCase());
        const sub = match || _store.subs[0];
        user = { email: sub.email, name: sub.name, role: 'sub', subId: sub.id, staffId: null };
      } else if (useRole === 'staff') {
        // resolve to a staff_member by email; else the first COVERABLE
        // staff member (so the demo lands on someone who gets offers).
        const list = _store.staffMembers || [];
        const match = list.find(m => (m.email || '').toLowerCase() === identifier.toLowerCase());
        const m = match || list.find(_isCoverableStaff) || list[0];
        user = m
          ? { email: m.email, name: m.displayName, role: 'staff', subId: null, staffId: m.id }
          : { email: identifier, name: 'Personal', role: 'staff', subId: null, staffId: null };
      } else {
        const local = identifier.split('@')[0];
        const name = local.split(/[._-]+/).filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Koordinator';
        user = { email: identifier, name, role: 'coordinator', subId: null, staffId: null };
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      localStorage.setItem(ROLE_KEY, user.role);
      return { ok: true, user };
    },

    logout() {
      sessionStorage.removeItem(SESSION_KEY);
    },

    getRole() {
      const u = this.getCurrentUser();
      if (u && u.role) return u.role;
      const r = localStorage.getItem(ROLE_KEY) || 'coordinator';
      return ['coordinator', 'sub', 'staff'].includes(r) ? r : 'coordinator';
    },

    // Switch role for the active session (re-resolves the backing record).
    setRole(role) {
      const r = ['sub', 'staff', 'coordinator'].includes(role) ? role : 'coordinator';
      localStorage.setItem(ROLE_KEY, r);
      const u = this.getCurrentUser();
      if (u) {
        // re-login under the new role. sub/staff re-resolve to a demo
        // default (drop the prior email); coordinator keeps the email.
        return this.login(r === 'coordinator' ? u.email : '', null, r);
      }
      return { ok: true };
    },

    // ======================================================
    // SCHOOL SETTINGS
    // ======================================================
    // getSchoolSettings() — returns a deep copy with the tier config
    // guaranteed present (migrating a legacy row on read) and
    // coverSourceMode kept in sync as a DERIVED best-effort legacy label.
    getSchoolSettings() {
      const tiers = _effectiveTiers();
      const out = JSON.parse(JSON.stringify(_store.schoolSettings));
      out.coverSourceTiers = tiers.map(t => ({ ...t }));
      out.coverSourceMode = _deriveCoverSourceMode(tiers);
      return out;
    },

    // updateSchoolSettings(patch). The tier config is the source of truth:
    //   patch.coverSourceTiers → validated (exactly the 4 keys, once each,
    //     boolean enabled, no dupes/unknowns) and stored; coverSourceMode is
    //     re-derived from it (any coverSourceMode in the same patch is
    //     ignored — tiers win).
    //   patch.coverSourceMode WITHOUT tiers → accepted as a legacy convenience
    //     and expanded into a tier config (back-compat for old callers).
    updateSchoolSettings(patch) {
      if (!patch || typeof patch !== 'object') return { ok: false, error: 'Invalid patch' };
      if (patch.coverOfferMode &&
          !['admin_assign', 'open_pool', 'cascade'].includes(patch.coverOfferMode)) {
        return { ok: false, error: 'Invalid coverOfferMode' };
      }
      // tiers are canonical; validate hard if present.
      let nextTiers = null;
      if (patch.coverSourceTiers !== undefined) {
        nextTiers = _validateTiers(patch.coverSourceTiers);
        if (!nextTiers) return { ok: false, error: 'Invalid coverSourceTiers' };
      } else if (patch.coverSourceMode !== undefined) {
        if (!['internal_first', 'external_first', 'internal_only', 'external_only', 'both'].includes(patch.coverSourceMode)) {
          return { ok: false, error: 'Invalid coverSourceMode' };
        }
        nextTiers = _tiersFromMode(patch.coverSourceMode);
      }
      if (patch.automationLevel &&
          !['manual', 'assisted', 'auto'].includes(patch.automationLevel)) {
        return { ok: false, error: 'Invalid automationLevel' };
      }
      if (patch.stepMinutes != null) {
        const n = Number(patch.stepMinutes);
        // 1 min (urgent) .. 20160 min (14 days, non-urgent future cases)
        if (!Number.isFinite(n) || n < 1 || n > 20160) return { ok: false, error: 'Invalid stepMinutes (1–20160)' };
        patch.stepMinutes = Math.round(n);
      }
      // strip the tier/mode keys from the generic merge; we set them explicitly.
      const { coverSourceTiers, coverSourceMode, ...rest } = patch;
      _store.schoolSettings = { ..._store.schoolSettings, ...rest };
      if (nextTiers) {
        _store.schoolSettings.coverSourceTiers = nextTiers.map(t => ({ ...t }));
        _store.schoolSettings.coverSourceMode = _deriveCoverSourceMode(nextTiers);
      }
      if (patch.channels) {
        _store.schoolSettings.channels = { ..._store.schoolSettings.channels, ...patch.channels };
      }
      _persist();
      return { ok: true, settings: this.getSchoolSettings() };
    },

    // ======================================================
    // SUBJECTS  (per-school, MUTABLE — teaching subjects + duties)
    // ======================================================
    // The matcher reads this store live: a gap.subject that matches a
    // 'teaching' entry requires qualification; one that matches a 'duty'
    // entry requires NONE (everyone qualified). Adding/removing here
    // immediately changes qualification + duty detection.
    //
    // listSubjects() → array of { name, type:'teaching'|'duty' } in store
    // order (teaching first as seeded, then duties). Deep copy.
    listSubjects() {
      return _subjects.map(s => ({ name: s.name, type: s.type }));
    },

    // addSubject(name, type) → { ok, subject? } | { ok:false, error }
    //   name : non-empty string (trimmed)
    //   type : 'teaching' (default) | 'duty'
    // Rejects empty names and case-insensitive duplicates. Persists.
    addSubject(name, type) {
      if (typeof name !== 'string' || !name.trim()) {
        return { ok: false, error: 'Subject name required' };
      }
      const clean = name.trim();
      const kind = type === 'duty' ? 'duty' : 'teaching';
      if (_subjectRow(clean)) {
        return { ok: false, error: 'Subject already exists' };
      }
      const row = { name: clean, type: kind };
      _subjects.push(row);
      _persistSubjects();
      return { ok: true, subject: { ...row } };
    },

    // removeSubject(name) → { ok } | { ok:false, error }. Case-insensitive.
    // Note: removing a subject does NOT rewrite subs/staff subjects[] or
    // open gaps — a gap on a removed subject simply falls back to "teaching
    // subject not in store" ⇒ qualification required, mismatch ⇒ not qualified.
    removeSubject(name) {
      const row = _subjectRow(name);
      if (!row) return { ok: false, error: 'Subject not found' };
      _subjects = _subjects.filter(s => s !== row);
      _persistSubjects();
      return { ok: true };
    },

    // ======================================================
    // PLUGIN MODE  (see header "PLUGIN SEAM")
    // ======================================================
    // getPluginMode() → 'standalone' | 'plugged_in' (default 'standalone').
    getPluginMode() { return _pluginMode; },

    // setPluginMode(mode) → { ok, mode } | { ok:false, error }. For demo
    // toggling only — does NOT itself rewire data sources (the seam is
    // documented, not implemented in this mock).
    setPluginMode(mode) {
      if (!PLUGIN_MODES.includes(mode)) {
        return { ok: false, error: 'Invalid plugin mode' };
      }
      _pluginMode = mode;
      try { localStorage.setItem(PLUGIN_KEY, mode); } catch { /* ignore quota */ }
      return { ok: true, mode };
    },

    // ======================================================
    // SUBS (the pool)
    // ======================================================
    // listSubs() — every sub with origin ('fvk'|'vk'), active (FVK toggle),
    // the derived pool tier key + its SV poolLabel, and reliabilityScore.
    listSubs() {
      return _store.subs.map(s => ({
        ...JSON.parse(JSON.stringify(s)),
        origin: _subOrigin(s),
        active: !!s.active,
        tier: _subTier(s),
        poolLabel: _poolLabel(_subTier(s)),
        reliabilityScore: _reliabilityScore(s.id),
      }));
    },

    getSub(id) {
      const s = _sub(id);
      if (!s) return null;
      return {
        ...JSON.parse(JSON.stringify(s)),
        origin: _subOrigin(s),
        active: !!s.active,
        tier: _subTier(s),
        poolLabel: _poolLabel(_subTier(s)),
        reliabilityScore: _reliabilityScore(s.id),
      };
    },

    createSub(data) {
      if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid data' };
      let name;
      try { name = _requireStr(data.name, 'name'); }
      catch (e) { return { ok: false, error: e.message }; }
      const sub = {
        id: _uid('sub'),
        name,
        initials: _initials(name),
        email: (data.email || '').trim(),
        phone: (data.phone || '').trim(),
        subjects: Array.isArray(data.subjects) ? data.subjects.filter(Boolean) : [],
        hourlyRate: Math.max(0, Math.round(Number(data.hourlyRate) || 0)),
        // created inside Vikariekollen → 'vk' unless an origin is passed.
        origin: data.origin === 'fvk' ? 'fvk' : 'vk',
        active: data.active !== false,
        notes: (data.notes || '').trim(),
      };
      _store.subs.push(sub);
      _store.defaultAvailability[sub.id] = [];
      _log('sub_created', { subId: sub.id, detail: 'Created ' + sub.name });
      _persist();
      return { ok: true, sub: this.getSub(sub.id) };
    },

    updateSub(id, patch) {
      const s = _sub(id);
      if (!s) return { ok: false, error: 'Sub not found' };
      if (!patch || typeof patch !== 'object') return { ok: false, error: 'Invalid patch' };
      if (patch.name != null) {
        try { s.name = _requireStr(patch.name, 'name'); s.initials = _initials(s.name); }
        catch (e) { return { ok: false, error: e.message }; }
      }
      if (patch.email != null)    s.email = String(patch.email).trim();
      if (patch.phone != null)    s.phone = String(patch.phone).trim();
      if (patch.subjects != null) s.subjects = Array.isArray(patch.subjects) ? patch.subjects.filter(Boolean) : s.subjects;
      if (patch.hourlyRate != null) s.hourlyRate = Math.max(0, Math.round(Number(patch.hourlyRate) || 0));
      if (patch.active != null)   s.active = !!patch.active;
      if (patch.origin != null)   s.origin = patch.origin === 'vk' ? 'vk' : 'fvk';
      if (patch.notes != null)    s.notes = String(patch.notes).trim();
      _log('sub_updated', { subId: id, detail: 'Updated ' + s.name });
      _persist();
      return { ok: true, sub: this.getSub(id) };
    },

    // setSubActive(id, bool) — flip the FVK activate state (moves an FVK sub
    // between the fvk_active and fvk_inactive tiers). Returns { ok }.
    setSubActive(id, on) {
      const s = _sub(id);
      if (!s) return { ok: false, error: 'Sub not found' };
      s.active = !!on;
      _log(on ? 'sub_activated' : 'sub_deactivated',
           { subId: id, detail: (on ? 'Activated ' : 'Deactivated ') + s.name });
      _persist();
      return { ok: true };
    },

    deactivateSub(id) {
      const s = _sub(id);
      if (!s) return { ok: false, error: 'Sub not found' };
      s.active = false;
      _log('sub_deactivated', { subId: id, detail: 'Deactivated ' + s.name });
      _persist();
      return { ok: true };
    },

    deleteSub(id) {
      const i = _store.subs.findIndex(s => s.id === id);
      if (i < 0) return { ok: false, error: 'Sub not found' };
      const [removed] = _store.subs.splice(i, 1);
      delete _store.defaultAvailability[id];
      // drop their week overrides
      Object.keys(_store.weekOverrides).forEach(k => {
        if (k.startsWith(id + '::')) delete _store.weekOverrides[k];
      });
      // drop activations
      Object.keys(_store.activations).forEach(d => {
        _store.activations[d] = _store.activations[d].filter(x => x !== id);
      });
      _log('sub_deleted', { subId: id, detail: 'Deleted ' + (removed ? removed.name : id) });
      _persist();
      return { ok: true };
    },

    // ======================================================
    // STAFF MEMBERS (the internal cover pool)
    // ======================================================
    // listStaff(opts?) — internal staff with derived fields.
    //   opts.coverableOnly: true → only role coverable|teaching.
    // Each row: { ...staffMember, reliabilityScore, coversThisMonth,
    //   workloadPct, coverable }.
    listStaff(opts) {
      const o = opts || {};
      let list = (_store.staffMembers || []).slice();
      if (o.coverableOnly) list = list.filter(_isCoverableStaff);
      return list.map(m => ({
        ...JSON.parse(JSON.stringify(m)),
        reliabilityScore: _reliabilityScore('staff', m.id),
        coversThisMonth: _staffCoversInMonth(m.id),
        workloadPct: _staffWorkloadPct(m.id),
        coverable: _isCoverableStaff(m),
      }));
    },

    getStaff(id) {
      const m = _staff(id);
      if (!m) return null;
      return {
        ...JSON.parse(JSON.stringify(m)),
        reliabilityScore: _reliabilityScore('staff', m.id),
        coversThisMonth: _staffCoversInMonth(m.id),
        workloadPct: _staffWorkloadPct(m.id),
        coverable: _isCoverableStaff(m),
      };
    },

    // The teaching schedule (busy windows) for a staff member.
    getStaffSchedule(id) {
      return ((_store.staffSchedules && _store.staffSchedules[id]) || [])
        .map(l => ({ ...l }));
    },

    // ======================================================
    // AVAILABILITY  (slot key "<dayIndex>-<hour>")
    // ======================================================
    getSchedule() {
      return { days: SCHEDULE.days.slice(), hours: SCHEDULE.hours.slice() };
    },

    getDefaultAvailability(subId) {
      return (_store.defaultAvailability[subId] || []).slice();
    },

    saveDefaultAvailability(subId, slots) {
      if (!_sub(subId)) return { ok: false, error: 'Sub not found' };
      if (!Array.isArray(slots)) return { ok: false, error: 'slots must be an array' };
      _store.defaultAvailability[subId] = slots.slice();
      _persist();
      return { ok: true };
    },

    // override-row-if-exists-else-default; presence detected by key existence
    getEffectiveAvailability(subId, weekId) {
      const key = `${subId}::${weekId}`;
      if (Object.prototype.hasOwnProperty.call(_store.weekOverrides, key)) {
        return { slots: (_store.weekOverrides[key] || []).slice(), source: 'override' };
      }
      return { slots: this.getDefaultAvailability(subId), source: 'default' };
    },

    saveWeekOverride(subId, weekId, slots) {
      if (!_sub(subId)) return { ok: false, error: 'Sub not found' };
      if (!Array.isArray(slots)) return { ok: false, error: 'slots must be an array' };
      _store.weekOverrides[`${subId}::${weekId}`] = slots.slice();
      _persist();
      return { ok: true };
    },

    clearWeekOverride(subId, weekId) {
      delete _store.weekOverrides[`${subId}::${weekId}`];
      _persist();
      return { ok: true };
    },

    hasWeekOverride(subId, weekId) {
      return Object.prototype.hasOwnProperty.call(_store.weekOverrides, `${subId}::${weekId}`);
    },

    getWeekId(date) {
      const { year, week } = _isoWeekData(date);
      return `${year}-W${String(week).padStart(2, '0')}`;
    },

    getWeekMeta(weekId) {
      const monday = _mondayFromWeekId(weekId);
      const friday = new Date(monday);
      friday.setUTCDate(monday.getUTCDate() + 4);
      const { week } = _isoWeekData(monday);
      const monDay = monday.getUTCDate(), friDay = friday.getUTCDate();
      const monMon = MONTH_NAMES[monday.getUTCMonth()], friMon = MONTH_NAMES[friday.getUTCMonth()];
      const range = monMon === friMon
        ? `${monDay}–${friDay} ${monMon}`
        : `${monDay} ${monMon}–${friDay} ${friMon}`;
      return { label: `Week ${week} · ${range}`, monday, friday, weekNumber: week };
    },

    // ======================================================
    // ACTIVATIONS
    // ======================================================
    getActivations(date) {
      return (_store.activations[date] || []).slice();
    },

    setActivation(subId, date, on) {
      if (!_sub(subId)) return { ok: false, error: 'Sub not found' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Invalid date' };
      const list = _store.activations[date] || (_store.activations[date] = []);
      const idx = list.indexOf(subId);
      if (on && idx < 0) list.push(subId);
      if (!on && idx >= 0) list.splice(idx, 1);
      _persist();
      return { ok: true };
    },

    // ======================================================
    // GAPS
    // ======================================================
    listGaps(filter) {
      let gaps = _store.gaps.map(g => ({
        ...JSON.parse(JSON.stringify(g)),
        status: _deriveGapStatus(g),
      }));
      if (filter) {
        if (filter.status) gaps = gaps.filter(g => g.status === filter.status);
        if (filter.date)   gaps = gaps.filter(g => g.date === filter.date);
        if (filter.subject) gaps = gaps.filter(g => g.subject === filter.subject);
      }
      gaps.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
      return gaps;
    },

    getGap(id) {
      const g = _gap(id);
      if (!g) return null;
      return { ...JSON.parse(JSON.stringify(g)), status: _deriveGapStatus(g) };
    },

    createGap(data) {
      if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid data' };
      let teacherName, date;
      try {
        teacherName = _requireStr(data.teacherName, 'teacherName');
        date = _requireStr(data.date, 'date');
      } catch (e) { return { ok: false, error: e.message }; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Invalid date' };
      const gap = {
        id: _uid('gap'),
        teacherName,
        teacherInitials: data.teacherInitials || _initials(teacherName),
        subject: (data.subject || '').trim() || null,
        group: (data.group || '').trim(),
        date,
        startTime: data.startTime || '08:00',
        endTime: data.endTime || '09:00',
        lessonCount: Math.max(1, Math.round(Number(data.lessonCount) || 1)),
        periodIds: Array.isArray(data.periodIds) ? data.periodIds : [],
        status: 'open_unsent',
        mode: data.mode || _store.schoolSettings.coverOfferMode,
        filledBySubId: null,
        filledBySubName: null,
      };
      _store.gaps.unshift(gap);
      _log('gap_created', { gapId: gap.id, detail: `${gap.subject || '—'} ${gap.group} ${gap.date}` });
      _persist();
      return { ok: true, gap: this.getGap(gap.id) };
    },

    updateGap(id, patch) {
      const g = _gap(id);
      if (!g) return { ok: false, error: 'Gap not found' };
      if (!patch || typeof patch !== 'object') return { ok: false, error: 'Invalid patch' };
      // mode can only change while open_unsent (no offer yet)
      if (patch.mode && _offerFor(id)) return { ok: false, error: 'Mode locked — offer sent' };
      const allowed = ['teacherName','teacherInitials','subject','group','date',
                       'startTime','endTime','lessonCount','periodIds','mode'];
      for (const k of allowed) if (patch[k] != null) g[k] = patch[k];
      if (patch.lessonCount != null) g.lessonCount = Math.max(1, Math.round(Number(patch.lessonCount) || 1));
      _persist();
      return { ok: true, gap: this.getGap(id) };
    },

    deleteGap(id) {
      const i = _store.gaps.findIndex(g => g.id === id);
      if (i < 0) return { ok: false, error: 'Gap not found' };
      _store.gaps.splice(i, 1);
      _store.offers = _store.offers.filter(o => o.gapId !== id);
      _store.assignments = _store.assignments.filter(a => a.gapId !== id);
      _persist();
      return { ok: true };
    },

    getStats() {
      const gaps = this.listGaps();
      const openGaps = gaps.filter(g => g.status === 'open_unsent' || g.status === 'cascade' || g.status === 'open_pool').length;
      const offersOut = gaps.filter(g => g.status === 'cascade' || g.status === 'open_pool').length;
      const today = new Date(_simNow()).toISOString().slice(0, 10);
      const filledToday = _store.assignments.filter(a => a.date === today).length
        || gaps.filter(g => g.status === 'filled' && g.date === today).length;
      // subs available today: active + activated + not conflicted on any gap today
      const subsAvailable = _store.subs.filter(s => {
        if (!s.active) return false;
        if (!_isActivated(s.id, today)) return false;
        const todaysGaps = gaps.filter(g => g.date === today);
        return !todaysGaps.some(g => _conflictFor('external_sub', s.id, g) === 'booked');
      }).length;
      return { openGaps, offersOut, filledToday, subsAvailable };
    },

    // ======================================================
    // MATCHING  (POLYMORPHIC — internal staff + external subs)
    // ======================================================
    // matchCandidates(gapId) → ranked UNIFIED candidates:
    //   { recipientType:'external_sub'|'staff', recipientId, subId(compat),
    //     name, initials, subjects[], rate, qualified, rank, state,
    //     reliabilityScore, conflict?, source:'internal'|'external',
    //     workloadPct?, freeNow? }
    //
    // SUBJECT QUALIFICATION IS SOFT (both pools): a subject mismatch never
    // excludes a candidate — it is surfaced as `qualified:false` so the UI
    // can show an "ej behörig" / "not qualified" flag, and it sorts BELOW
    // qualified candidates within the same tier. `qualified` is true when the
    // gap requires no qualification (no subject, or a NON-TEACHING DUTY
    // subject per the vk_subjects store) OR the candidate's subjects[] include
    // the gap subject.
    //
    // Eligibility (subject is NOT a filter):
    //   external sub  → active + availability for the gap hours + activated
    //                   for the date (existing rules, minus the old subject
    //                   exclusion).
    //   internal staff→ role coverable|teaching + FREE PERIOD at the gap
    //                   (no overlapping lesson) + under monthly cover limit.
    //
    // Pooling honours schoolSettings.coverSourceMode:
    //   internal_only / external_only → that pool only
    //   internal_first / external_first → both pools, that source ranked
    //                                     ahead of the other
    //   both → blended rank (reliability desc, cost asc, workload asc)
    matchCandidates(gapId) {
      const gap = _gap(gapId);
      if (!gap) return [];
      const offer = _offerFor(gapId);

      // TIER CONFIG is the source of truth. Build a key→index map over the
      // ENABLED tiers in their configured order; a tier absent from the map
      // is disabled and its candidates are excluded.
      const tiers = _effectiveTiers();
      const tierIndex = {};
      tiers.filter(t => t.enabled).forEach((t, i) => { tierIndex[t.key] = i; });
      const tierEnabled = (key) => Object.prototype.hasOwnProperty.call(tierIndex, key);
      const wantInternal = tierEnabled('internal_staff');
      // any external sub pool enabled?
      const wantExternal = tierEnabled('fvk_active') || tierEnabled('vk_subs') || tierEnabled('fvk_inactive');

      const eligible = [];

      // -- EXTERNAL SUBS -- (one of three sub tiers, by origin + active)
      // NOTE: 'active'/'inactive' is the FVK pool attribute and is SEPARATE
      // from availability/activation — an inactive sub is simply in a lower
      // (fvk_inactive) tier, still subject to availability if that tier is on.
      if (wantExternal) {
        for (const s of _store.subs) {
          const tierKey = _subTier(s);
          if (!tierEnabled(tierKey)) continue;             // tier off → exclude
          // SUBJECT QUALIFICATION IS SOFT: a subject mismatch no longer
          // excludes the sub — it is surfaced as qualified:false so the UI
          // can flag "ej behörig". A duty gap requires no qualification.
          if (!_availableForGap(s.id, gap)) continue;
          if (!_isActivated(s.id, gap.date)) continue;
          const tgt = offer ? offer.targets.find(t => _tMatch(t, 'external_sub', s.id)) : null;
          const qualified = _isQualified(s.subjects, gap);
          eligible.push({
            recipientType: 'external_sub', recipientId: s.id, subId: s.id,
            source: 'external', tier: tierKey, poolLabel: _poolLabel(tierKey),
            origin: _subOrigin(s), active: !!s.active,
            name: s.name, initials: s.initials,
            subjects: s.subjects.slice(),
            rate: s.hourlyRate,
            qualified,
            reliabilityScore: _reliabilityScore('external_sub', s.id),
            state: tgt ? _candidateState(tgt.state) : 'pending',
            sentAt: tgt ? (tgt.sentAt || null) : null,
            stepExpiresAt: tgt ? (tgt.stepExpiresAt || null) : null,
            _existingRank: tgt ? tgt.rank : null,
            _tierIdx: tierIndex[tierKey],
            _qualSort: qualified ? 0 : 1,
            _workloadSort: 0,
            conflict: _conflictFor('external_sub', s.id, gap) || undefined,
          });
        }
      }

      // -- INTERNAL STAFF -- (the internal_staff tier)
      if (wantInternal) {
        for (const m of (_store.staffMembers || [])) {
          if (!_isCoverableStaff(m)) continue;
          if (!_staffFreeForGap(m.id, gap)) continue;     // free-period rule
          if (!_staffUnderLimit(m.id, gap)) continue;      // workload/cover limit
          const tgt = offer ? offer.targets.find(t => _tMatch(t, 'staff', m.id)) : null;
          // Staff already treat subject as a boost, not a filter — align them
          // to the same soft `qualified` flag the externals now carry.
          const qualified = _isQualified(m.subjects, gap);
          eligible.push({
            recipientType: 'staff', recipientId: m.id, subId: null,
            source: 'internal', tier: 'internal_staff', poolLabel: _poolLabel('internal_staff'),
            name: m.displayName, initials: m.initials,
            subjects: m.subjects.slice(),
            rate: (m.internalRate || 0),
            qualified,
            reliabilityScore: _reliabilityScore('staff', m.id),
            state: tgt ? _candidateState(tgt.state) : 'pending',
            sentAt: tgt ? (tgt.sentAt || null) : null,
            stepExpiresAt: tgt ? (tgt.stepExpiresAt || null) : null,
            _existingRank: tgt ? tgt.rank : null,
            _tierIdx: tierIndex['internal_staff'],
            _qualSort: qualified ? 0 : 1,
            workloadPct: _staffWorkloadPct(m.id, gap.date),
            freeNow: true,
            _workloadSort: _staffWorkloadPct(m.id, gap.date),
            conflict: _conflictFor('staff', m.id, gap) || undefined,
          });
        }
      }

      // Surface any existing offer targets that fell out of eligibility
      // (e.g. a staff member who became busy after contact) so their state
      // still shows. We do NOT surface targets whose TIER is now disabled —
      // that pool is off entirely for this school.
      if (offer) {
        for (const t of offer.targets) {
          const type = _tType(t), id = _tId(t);
          if (eligible.some(e => e.recipientType === type && e.recipientId === id)) continue;
          const rec = _recipientRecord(type, id);
          if (!rec) continue;
          const tierKey = type === 'staff' ? 'internal_staff' : _subTier(rec);
          if (!tierEnabled(tierKey)) continue;
          if (type === 'staff') {
            const qualified = _isQualified(rec.subjects, gap);
            eligible.push({
              recipientType: 'staff', recipientId: id, subId: null, source: 'internal',
              tier: 'internal_staff', poolLabel: _poolLabel('internal_staff'),
              name: rec.displayName, initials: rec.initials, subjects: rec.subjects.slice(),
              rate: (rec.internalRate || 0),
              qualified,
              reliabilityScore: _reliabilityScore('staff', id),
              state: _candidateState(t.state), _existingRank: t.rank,
              sentAt: t.sentAt || null,
              stepExpiresAt: t.stepExpiresAt || null,
              _tierIdx: tierIndex['internal_staff'],
              _qualSort: qualified ? 0 : 1,
              workloadPct: _staffWorkloadPct(id, gap.date), freeNow: _staffFreeForGap(id, gap),
              _workloadSort: _staffWorkloadPct(id, gap.date),
              conflict: _conflictFor('staff', id, gap) || undefined,
            });
          } else {
            const qualified = _isQualified(rec.subjects, gap);
            eligible.push({
              recipientType: 'external_sub', recipientId: id, subId: id, source: 'external',
              tier: tierKey, poolLabel: _poolLabel(tierKey),
              origin: _subOrigin(rec), active: !!rec.active,
              name: rec.name, initials: rec.initials, subjects: rec.subjects.slice(),
              rate: rec.hourlyRate,
              qualified,
              reliabilityScore: _reliabilityScore('external_sub', id),
              state: _candidateState(t.state), _existingRank: t.rank,
              sentAt: t.sentAt || null,
              stepExpiresAt: t.stepExpiresAt || null,
              _tierIdx: tierIndex[tierKey],
              _qualSort: qualified ? 0 : 1,
              _workloadSort: 0,
              conflict: _conflictFor('external_sub', id, gap) || undefined,
            });
          }
        }
      }

      // exclude hard-booked candidates that have no live target
      const filtered = eligible.filter(e =>
        e.conflict !== 'booked' || ['contacted','accepted','queued'].includes(e.state));

      // Ranking:
      //  1. established offer ranks come first (preserve a live cascade order
      //     once an offer has been sent — don't reshuffle contacted targets)
      //  2. then TIER index (lower = higher-priority enabled tier) — the tier
      //     model stays the source of truth
      //  3. then QUALIFIED desc (qualified above unqualified WITHIN a tier;
      //     soft rule — unqualified still appears, just lower)
      //  4. within that: reliability desc → rate asc → workload asc → name
      filtered.sort((a, b) => {
        if (a._existingRank != null && b._existingRank != null) return a._existingRank - b._existingRank;
        if (a._existingRank != null) return -1;
        if (b._existingRank != null) return 1;
        if (a._tierIdx !== b._tierIdx) return a._tierIdx - b._tierIdx;
        if (a._qualSort !== b._qualSort) return a._qualSort - b._qualSort;
        if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
        if (a.rate !== b.rate) return a.rate - b.rate;
        if (a._workloadSort !== b._workloadSort) return a._workloadSort - b._workloadSort;
        return a.name.localeCompare(b.name);
      });

      return filtered.map((c, i) => {
        const { _existingRank, _tierIdx, _qualSort, _workloadSort, ...rest } = c;
        return { ...rest, rank: i + 1 };
      });
    },

    // ======================================================
    // OFFER LIFECYCLE
    // ======================================================
    // sendOffer(gapId) — respects gap.mode.
    //   cascade   : rank1 → contacted (with stepExpiresAt), rest → queued
    //   open_pool : all matched → contacted
    //   admin_assign: not sent here (use adminAssign)
    sendOffer(gapId) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      if (gap.status === 'filled' || gap.status === 'expired') return { ok: false, error: 'Gap closed' };
      if (gap.mode === 'admin_assign') return { ok: false, error: 'admin_assign uses adminAssign()' };
      if (_offerFor(gapId)) return { ok: false, error: 'Offer already sent' };

      const candidates = this.matchCandidates(gapId).filter(c => c.conflict !== 'booked');
      if (candidates.length === 0) return { ok: false, error: 'No candidates' };

      const stepMin = _store.schoolSettings.stepMinutes || 15;
      const targets = candidates.map((c, i) => {
        const isFirst = i === 0;
        if (gap.mode === 'cascade') {
          return _mkTarget(c.recipientType, c.recipientId, {
            rank: i + 1,
            state: isFirst ? 'contacted' : 'queued',
            responseToken: _token(),
            sentAt: isFirst ? _simIso() : null,
            respondedAt: null,
            stepExpiresAt: isFirst ? new Date(_simNow() + stepMin * 60000).toISOString() : null,
          });
        }
        // open_pool — all contacted at once
        return _mkTarget(c.recipientType, c.recipientId, {
          rank: i + 1, state: 'contacted',
          responseToken: _token(), sentAt: _simIso(),
          respondedAt: null, stepExpiresAt: null,
        });
      });

      _store.offers.push({ id: _uid('offer'), gapId, mode: gap.mode, targets });
      _log('offer_sent', { gapId, detail: `${gap.mode} · ${gap.subject || '—'} ${gap.group}` });
      if (gap.mode === 'cascade') {
        _log('target_contacted', { gapId, recipientType: _tType(targets[0]), recipientId: _tId(targets[0]), detail: 'Contacted rank 1' });
      } else {
        targets.forEach(t => _log('target_contacted', { gapId, recipientType: _tType(t), recipientId: _tId(t), detail: 'Pool contact' }));
      }
      _persist();
      return { ok: true };
    },

    // simulateResponse(gapId, subId, kind) — back-compat external wrapper.
    // Coordinator/pool views call this for external subs; it delegates to
    // the polymorphic core. For staff use respond()/staffAccept/staffDecline.
    simulateResponse(gapId, subId, kind) {
      return this.respond(gapId, 'external_sub', subId, kind);
    },

    // respond(gapId, recipientType, recipientId, 'accept'|'decline')
    // The polymorphic accept/decline core for BOTH pools.
    respond(gapId, recipientType, recipientId, kind) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      const offer = _offerFor(gapId);
      if (!offer) return { ok: false, error: 'No offer sent' };
      const tgt = offer.targets.find(t => _tMatch(t, recipientType, recipientId));
      if (!tgt) return { ok: false, error: 'Target not found' };
      if (!['contacted', 'sent'].includes(tgt.state)) return { ok: false, error: 'Target not awaiting response' };

      if (kind === 'accept') {
        if (gap.status === 'filled') return { ok: false, error: 'Gap already filled' };
        tgt.state = 'accepted';
        tgt.respondedAt = _simIso();
        gap.status = 'filled';
        gap.filledByType = recipientType;
        gap.filledById = recipientId;
        gap.filledBySubId = recipientType === 'external_sub' ? recipientId : null;
        gap.filledBySubName = _recipientName(recipientType, recipientId);
        // supersede all other live targets
        offer.targets.forEach(o => {
          if (!_tMatch(o, recipientType, recipientId) &&
              ['pending','queued','contacted','sent'].includes(o.state)) {
            o.state = 'superseded';
          }
        });
        this._writeBack(gap, recipientType, recipientId);
        _log('offer_accepted', { gapId, recipientType, recipientId, detail: `Accepted ${gap.subject || '—'} ${gap.group}` });
        _persist();
        return { ok: true, filled: true };
      }

      if (kind === 'decline') {
        tgt.state = 'declined';
        tgt.respondedAt = _simIso();
        _log('offer_declined', { gapId, recipientType, recipientId, detail: `Declined ${gap.subject || '—'} ${gap.group}` });
        if (offer.mode === 'cascade') {
          const released = _releaseNext(offer, gap);
          if (!released) {
            gap.status = 'expired';
            _log('offer_expired', { gapId, detail: 'Cascade exhausted' });
          }
        }
        _persist();
        return { ok: true, filled: false };
      }

      return { ok: false, error: 'Unknown kind' };
    },

    // adminAssign(gapId, subId) — external back-compat wrapper.
    adminAssign(gapId, subId) {
      return this.adminAssignRecipient(gapId, 'external_sub', subId);
    },

    // adminAssignRecipient(gapId, recipientType, recipientId) — direct
    // fill from either pool, no send.
    adminAssignRecipient(gapId, recipientType, recipientId) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      if (gap.status === 'filled') return { ok: false, error: 'Gap already filled' };
      const rec = _recipientRecord(recipientType, recipientId);
      if (!rec) return { ok: false, error: 'Recipient not found' };

      let offer = _offerFor(gapId);
      if (!offer) {
        offer = { id: _uid('offer'), gapId, mode: 'admin_assign', targets: [] };
        _store.offers.push(offer);
      }
      let tgt = offer.targets.find(t => _tMatch(t, recipientType, recipientId));
      if (!tgt) {
        tgt = _mkTarget(recipientType, recipientId, {
          rank: offer.targets.length + 1, state: 'pending',
          responseToken: _token(), sentAt: null, respondedAt: null, stepExpiresAt: null,
        });
        offer.targets.push(tgt);
      }
      tgt.state = 'accepted';
      tgt.respondedAt = _simIso();
      gap.status = 'filled';
      gap.filledByType = recipientType;
      gap.filledById = recipientId;
      gap.filledBySubId = recipientType === 'external_sub' ? recipientId : null;
      gap.filledBySubName = _recipientName(recipientType, recipientId);
      offer.targets.forEach(o => {
        if (!_tMatch(o, recipientType, recipientId) &&
            ['pending','queued','contacted','sent'].includes(o.state)) {
          o.state = 'superseded';
        }
      });
      this._writeBack(gap, recipientType, recipientId);
      _log('admin_assigned', { gapId, recipientType, recipientId, detail: `Admin assigned ${gap.filledBySubName} · ${gap.subject || '—'} ${gap.group}` });
      _persist();
      return { ok: true, filled: true };
    },

    cancelOffer(gapId) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      _store.offers = _store.offers.filter(o => o.gapId !== gapId);
      if (gap.status !== 'filled') gap.status = 'open_unsent';
      _log('offer_cancelled', { gapId, detail: 'Offer cancelled' });
      _persist();
      return { ok: true };
    },

    // internal: create the cover_assignments write-back row (polymorphic).
    // For external subs cost = their hourly rate × lessonCount.
    // For internal staff cost = their internalRate × lessonCount (often 0,
    // i.e. no marginal payroll cost) AND we record externalComparableSek —
    // what an average external would have cost — so the savings hook can
    // value the internal cover. isExternal flags the pool.
    _writeBack(gap, recipientType, recipientId) {
      const rec = _recipientRecord(recipientType, recipientId);
      if (!rec) return;
      // avoid duplicate write-back for the same gap
      if (_store.assignments.some(a => a.gapId === gap.id)) return;
      const lessons = gap.lessonCount || 1;
      const isExternal = recipientType === 'external_sub';
      const cost = isExternal
        ? (rec.hourlyRate || 0) * lessons
        : (rec.internalRate || 0) * lessons;
      const externalComparable = isExternal ? cost : _avgExternalRate() * lessons;
      const asg = {
        id: _uid('asg'),
        gapId: gap.id,
        date: gap.date,
        recipientType,
        recipientId,
        subId: isExternal ? recipientId : null,
        subName: isExternal ? rec.name : rec.displayName,
        subject: gap.subject,
        costSek: cost,
        externalComparableSek: externalComparable,
        isExternal,
        isConfirmed: true,
        assignedAt: _simIso(),
      };
      _store.assignments.push(asg);
      gap.fillAssignmentId = asg.id;
    },

    // ======================================================
    // SUB-SIDE
    // ======================================================
    // getOffersForSub(subId) → contacted/pending offers with gap context.
    // Thin wrapper over the polymorphic recipient query for external subs.
    getOffersForSub(subId) {
      return _offersForRecipient('external_sub', subId);
    },

    // subAccept / subDecline — accept { gapId, subId } or a response token
    subAccept(arg) {
      const { gapId, subId } = _resolveTargetArg(arg);
      if (!gapId || !subId) return { ok: false, error: 'Invalid argument' };
      return this.simulateResponse(gapId, subId, 'accept');
    },

    subDecline(arg) {
      const { gapId, subId } = _resolveTargetArg(arg);
      if (!gapId || !subId) return { ok: false, error: 'Invalid argument' };
      return this.simulateResponse(gapId, subId, 'decline');
    },

    // getBookingsForSub(subId) → upcoming assignments with lesson context
    getBookingsForSub(subId) {
      return _coversForRecipient('external_sub', subId);
    },

    // ======================================================
    // STAFF-SIDE  (internal cover candidate self-service)
    // ======================================================
    // getRequestsForStaff(staffId) → live cover requests sent to this
    // staff member: [{ gapId, recipientId, recipientType:'staff',
    //   responseToken, state, rank, stepExpiresAt, gap }]
    getRequestsForStaff(staffId) {
      return _offersForRecipient('staff', staffId);
    },

    // staffAccept(arg) / staffDecline(arg) — accept { gapId, staffId }
    // or a response token. Same lifecycle as the sub path; the write-back
    // records an internal (isExternal:false) cover_assignment.
    staffAccept(arg) {
      const { gapId, staffId } = _resolveStaffArg(arg);
      if (!gapId || !staffId) return { ok: false, error: 'Invalid argument' };
      return this.respond(gapId, 'staff', staffId, 'accept');
    },

    staffDecline(arg) {
      const { gapId, staffId } = _resolveStaffArg(arg);
      if (!gapId || !staffId) return { ok: false, error: 'Invalid argument' };
      return this.respond(gapId, 'staff', staffId, 'decline');
    },

    // getCoversForStaff(staffId) → covers this staff member agreed to,
    // with gap + lessons context (their upcoming covers).
    getCoversForStaff(staffId) {
      return _coversForRecipient('staff', staffId);
    },

    // getStaffWorkload(staffId) → { coversThisMonth, coverLimit,
    //   workloadPct, hoursThisMonth } for the "Min arbetsbörda" view.
    getStaffWorkload(staffId) {
      const m = _staff(staffId);
      const coverLimit = (m && m.coverLimit) || 0;
      const coversThisMonth = _staffCoversInMonth(staffId);
      const workloadPct = _staffWorkloadPct(staffId);
      const ym = _simIso().slice(0, 7);
      let hoursThisMonth = 0;
      for (const a of _store.assignments) {
        const aType = a.recipientType || 'external_sub';
        const aId   = a.recipientId != null ? a.recipientId : a.subId;
        if (aType !== 'staff' || aId !== staffId) continue;
        if ((a.date || '').slice(0, 7) !== ym) continue;
        const gap = _gap(a.gapId);
        // ~50 min per lesson period → hours; fall back to lessonCount.
        hoursThisMonth += ((gap && gap.lessonCount) || 1) * (50 / 60);
      }
      return {
        coversThisMonth,
        coverLimit,
        workloadPct,
        hoursThisMonth: Math.round(hoursThisMonth * 10) / 10,
      };
    },

    // ======================================================
    // HISTORY / ANALYTICS
    // ======================================================
    listHistory(filter) {
      let log = _store.auditLog.slice();
      if (filter) {
        if (filter.gapId) log = log.filter(e => e.gapId === filter.gapId);
        if (filter.subId) log = log.filter(e => e.subId === filter.subId);
        if (filter.type)  log = log.filter(e => e.type === filter.type);
      }
      log.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      return JSON.parse(JSON.stringify(log));
    },

    getAnalytics() {
      const gaps = this.listGaps();
      const totalNeeded = gaps.filter(g => g.status !== 'open_unsent').length || gaps.length;
      const filled = gaps.filter(g => g.status === 'filled').length;
      const fillRate = gaps.length ? Math.round((filled / gaps.length) * 100) : 0;

      // avg minutes to fill: from first offer_sent to offer_accepted/admin_assigned per gap
      const sentMap = {}, fillMap = {};
      for (const e of _store.auditLog) {
        if (e.type === 'offer_sent' && e.gapId && !sentMap[e.gapId]) sentMap[e.gapId] = e.ts;
        if ((e.type === 'offer_accepted' || e.type === 'admin_assigned') && e.gapId) fillMap[e.gapId] = e.ts;
      }
      const durations = [];
      Object.keys(fillMap).forEach(gid => {
        if (sentMap[gid]) {
          const mins = (new Date(fillMap[gid]) - new Date(sentMap[gid])) / 60000;
          if (mins >= 0) durations.push(mins);
        }
      });
      const avgMinutesToFill = durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

      const totalCostSek = _store.assignments.reduce((sum, a) => sum + (a.costSek || 0), 0);

      const offersByMode = { admin_assign: 0, open_pool: 0, cascade: 0 };
      _store.offers.forEach(o => { if (offersByMode[o.mode] != null) offersByMode[o.mode]++; });

      let sent = 0, declined = 0;
      for (const e of _store.auditLog) {
        if (e.type === 'target_contacted' || (e.type === 'offer_sent')) sent++;
        if (e.type === 'offer_declined') declined++;
      }
      const declineRate = sent ? Math.round((declined / sent) * 100) : 0;

      // ── SAVINGS HOOK (internal vs external) ──────────────────
      // internalCostSek / externalCostSek: actual spend per pool.
      // estimatedSavingsSek: for every INTERNAL cover, what an external
      // would have cost (externalComparableSek) minus the internal cost
      // actually incurred — i.e. money not spent on agency subs.
      // *CoverCount: how many covers each pool absorbed.
      let internalCostSek = 0, externalCostSek = 0;
      let internalCoverCount = 0, externalCoverCount = 0, estimatedSavingsSek = 0;
      // per-pool external split (both VK and FVK subs are 'external' cost).
      const costByTier = { internal_staff: 0, fvk_active: 0, vk_subs: 0, fvk_inactive: 0 };
      const coverCountByTier = { internal_staff: 0, fvk_active: 0, vk_subs: 0, fvk_inactive: 0 };
      for (const a of _store.assignments) {
        const isExternal = a.recipientType
          ? a.recipientType === 'external_sub'
          : (a.isExternal !== false);
        if (isExternal) {
          externalCostSek += (a.costSek || 0);
          externalCoverCount++;
          // classify into the sub's current pool tier for the split.
          const sid = a.recipientId != null ? a.recipientId : a.subId;
          const s = _sub(sid);
          const tk = s ? _subTier(s) : 'fvk_active';
          costByTier[tk] += (a.costSek || 0);
          coverCountByTier[tk]++;
        } else {
          internalCostSek += (a.costSek || 0);
          internalCoverCount++;
          costByTier.internal_staff += (a.costSek || 0);
          coverCountByTier.internal_staff++;
          const comparable = a.externalComparableSek != null
            ? a.externalComparableSek
            : _avgExternalRate() * 2;
          estimatedSavingsSek += Math.max(0, comparable - (a.costSek || 0));
        }
      }

      return {
        fillRate, avgMinutesToFill, totalCostSek, offersByMode, declineRate,
        internalCostSek, externalCostSek, estimatedSavingsSek,
        internalCoverCount, externalCoverCount,
        costByTier, coverCountByTier,
      };
    },

    // ======================================================
    // LESSONS
    // ======================================================
    listLessons(filter) {
      let ls = _store.lessons.slice();
      if (filter && filter.date) ls = ls.filter(l => l.date === filter.date);
      return JSON.parse(JSON.stringify(ls));
    },
    getLesson(id) {
      const l = _lesson(id);
      return l ? JSON.parse(JSON.stringify(l)) : null;
    },

    // ======================================================
    // DEMO RESET
    // ======================================================
    resetDemo() {
      _store = makeSeed();
      _persist();
      // reseed the subjects store from the canonical list too
      _subjects = _canonicalSubjects();
      _persistSubjects();
      return { ok: true };
    },
  };

  // resolve { gapId, subId } or a response token string (external subs)
  function _resolveTargetArg(arg) {
    if (arg && typeof arg === 'object' && arg.gapId && arg.subId) {
      return { gapId: arg.gapId, subId: arg.subId };
    }
    if (typeof arg === 'string') {
      for (const o of _store.offers) {
        const t = o.targets.find(t => t.responseToken === arg && _tType(t) === 'external_sub');
        if (t) return { gapId: o.gapId, subId: _tId(t) };
      }
    }
    return { gapId: null, subId: null };
  }

  // resolve { gapId, staffId } or a response token string (internal staff)
  function _resolveStaffArg(arg) {
    if (arg && typeof arg === 'object' && arg.gapId && arg.staffId) {
      return { gapId: arg.gapId, staffId: arg.staffId };
    }
    if (typeof arg === 'string') {
      for (const o of _store.offers) {
        const t = o.targets.find(t => t.responseToken === arg && _tType(t) === 'staff');
        if (t) return { gapId: o.gapId, staffId: _tId(t) };
      }
    }
    return { gapId: null, staffId: null };
  }

  // Run an initial cascade tick on load so a freshly seeded/advanced clock
  // is consistent (no-op if nothing is overdue).
  _tickCascade();

}());
