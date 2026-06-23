// ============================================================
// ADAPTER — REPLACE THIS FILE WHEN INTEGRATING WITH THE REAL
// VIKARIEKOLLEN / FRÅNVAROKOLLEN BACKEND.
//
// The UI (app.js) only ever calls window.Adapter.*  — it never
// touches localStorage, sessionStorage, Supabase, or any network
// directly. To go live, reimplement the functions below against
// the Supabase schema in vikariekollen_schema.sql (cover_offers,
// cover_offer_targets) and the edge functions / SMS+email
// integrations. Do not change app.js or styles.css.
//
// Contract (coordinator-facing):
//
//   Auth
//   ─────────────────────────────────────────────────────────
//   getCurrentUser()                → { email, name } | null
//   login(email, code)              → { ok, error? }
//   logout()                        → void
//
//   School settings
//   ─────────────────────────────────────────────────────────
//   getSchoolDefaultMode()          → 'admin_assign'|'open_pool'|'cascade'
//   setSchoolDefaultMode(mode)      → { ok }
//
//   Gaps (cover_offers rows + absence meta)
//   ─────────────────────────────────────────────────────────
//   getGaps()                       → Gap[]
//   getStats()                      → { openGaps, offersOut, filledToday, subsAvailable }
//
//   Candidates (match_cover_candidates RPC)
//   ─────────────────────────────────────────────────────────
//   getCandidates(gapId)            → Candidate[]   ranked 1..n
//
//   Offer actions
//   ─────────────────────────────────────────────────────────
//   sendOffer(gapId)                → { ok }
//   simulateResponse(gapId, subId, kind)  kind ∈ 'accept'|'decline'  → { ok }
//   adminAssign(gapId, subId)       → { ok }
//
//   Demo utility
//   ─────────────────────────────────────────────────────────
//   resetDemo()                     → void   (restores seed data)
//
// ── Gap shape ───────────────────────────────────────────────
//   { id, teacherName, teacherInitials, subject, group, date,
//     startTime "HH:MM", endTime "HH:MM", lessonCount,
//     status: 'open_unsent'|'cascade'|'open_pool'|'filled',
//     mode: 'admin_assign'|'open_pool'|'cascade',
//     filledBySubName: string|null }
//
// ── Candidate shape ─────────────────────────────────────────
//   { subId, name, initials, subjects: string[], hourlyRate,
//     rank, state: 'pending'|'queued'|'contacted'|'accepted'|
//                  'declined'|'superseded' }
//
// ── Real backend mapping (vikariekollen_schema.sql) ─────────
//   getGaps()            → SELECT cover_offers JOIN absence_periods/cover_records
//   getCandidates(id)    → match_cover_candidates(p_offer_id) RPC
//   sendOffer()          → INSERT cover_offer_targets + invoke cover-offer-tick
//                          edge function → 46elks SMS / Resend email
//   simulateResponse(accept) → accept_cover_offer(response_token) RPC
//                              (triggered by the sub's tokenized SMS/email link)
//   simulateResponse(decline) → decline_cover_offer(response_token) RPC
//                               + cover-offer-tick to advance cascade
//   adminAssign()        → admin_assign_cover(p_offer_id, p_sub_id) RPC
//   accept write-back    → inserts cover_assignments row + updates
//                          absence_periods.covering_sub_id
//
// ── Security model ──────────────────────────────────────────
//   All RPCs are SECURITY DEFINER with set search_path = public.
//   External subs (no auth.users row) use response_token for the
//   accept/decline path — they never touch tables directly.
//   Portal reads are gated by school_isolation RLS policy via
//   get_user_school_id(). NO anon/authenticated broad policies.
//   SMS = 46elks (unbuilt). Email = Resend (unbuilt).
//
// IMPORTANT — functions are currently synchronous (mock).
// At integration they will likely become async (return Promises);
// await them at every call site in app.js — that is the only
// permitted change to app.js during integration.
// ============================================================

(function () {
  'use strict';

  // ----------------------------------------------------------
  // STORAGE KEYS
  // ----------------------------------------------------------
  const SESSION_KEY   = 'vk_user';
  const MODE_KEY      = 'vk_default_mode';
  const LANG_KEY      = 'vk_lang';

  // ----------------------------------------------------------
  // SEED DATA FACTORY
  // Returns a fresh deep copy of the mock state on every call.
  // ----------------------------------------------------------
  function makeSeed() {
    return {
      gaps: [
        {
          id: 'gap-1',
          teacherName: 'Anna Lindqvist',
          teacherInitials: 'AL',
          subject: 'Matematik',
          group: '8B',
          date: '2026-06-25',
          startTime: '08:20',
          endTime: '10:05',
          lessonCount: 2,
          status: 'cascade',
          mode: 'cascade',
          filledBySubName: null,
        },
        {
          id: 'gap-2',
          teacherName: 'Per Magnusson',
          teacherInitials: 'PM',
          subject: 'Engelska',
          group: '7A',
          date: '2026-06-25',
          startTime: '10:25',
          endTime: '12:10',
          lessonCount: 2,
          status: 'open_unsent',
          mode: 'cascade',
          filledBySubName: null,
        },
        {
          id: 'gap-3',
          teacherName: 'Karin Svensson',
          teacherInitials: 'KS',
          subject: 'Biologi',
          group: '9A',
          date: '2026-06-25',
          startTime: '13:10',
          endTime: '14:55',
          lessonCount: 2,
          status: 'open_unsent',
          mode: 'open_pool',
          filledBySubName: null,
        },
        {
          id: 'gap-4',
          teacherName: 'Jonas Ek',
          teacherInitials: 'JE',
          subject: 'Idrott',
          group: '9C',
          date: '2026-06-24',
          startTime: '09:15',
          endTime: '11:00',
          lessonCount: 2,
          status: 'filled',
          mode: 'admin_assign',
          filledBySubName: 'Lars Ek',
        },
      ],

      candidates: {
        // gap-1: Matematik 8B — mid-flight cascade (rank1 already contacted)
        'gap-1': [
          { subId: 'sub-1', name: 'Erik Karlsson',  initials: 'EK', subjects: ['Matematik','Fysik'],    hourlyRate: 320, rank: 1, state: 'contacted' },
          { subId: 'sub-2', name: 'Johan Berg',     initials: 'JB', subjects: ['Matematik'],            hourlyRate: 310, rank: 2, state: 'queued' },
          { subId: 'sub-3', name: 'Sofia Nyström',  initials: 'SN', subjects: ['Matematik','Kemi'],     hourlyRate: 295, rank: 3, state: 'queued' },
        ],
        // gap-2: Engelska 7A — unsent, cascade mode
        'gap-2': [
          { subId: 'sub-4', name: 'Maria Olsson',   initials: 'MO', subjects: ['Engelska','Svenska'],   hourlyRate: 300, rank: 1, state: 'pending' },
          { subId: 'sub-5', name: 'Lars Lindberg',  initials: 'LL', subjects: ['Engelska'],             hourlyRate: 280, rank: 2, state: 'pending' },
          { subId: 'sub-6', name: 'Anna Björk',     initials: 'AB', subjects: ['Engelska','Historia'],  hourlyRate: 290, rank: 3, state: 'pending' },
        ],
        // gap-3: Biologi 9A — unsent, open_pool mode
        'gap-3': [
          { subId: 'sub-7', name: 'Peter Holm',     initials: 'PH', subjects: ['Biologi','Kemi'],       hourlyRate: 315, rank: 1, state: 'pending' },
          { subId: 'sub-8', name: 'Sara Lindqvist', initials: 'SL', subjects: ['Biologi'],              hourlyRate: 285, rank: 2, state: 'pending' },
          { subId: 'sub-9', name: 'Tom Eriksson',   initials: 'TE', subjects: ['Biologi','NO'],         hourlyRate: 300, rank: 3, state: 'pending' },
          { subId: 'sub-10',name: 'Lena Persson',   initials: 'LP', subjects: ['Biologi','Fysik'],      hourlyRate: 270, rank: 4, state: 'pending' },
        ],
        // gap-4: Idrott 9C — already filled, Lars Ek was admin-assigned
        'gap-4': [
          { subId: 'sub-11', name: 'Lars Ek',       initials: 'LE', subjects: ['Idrott','Hälsa'],       hourlyRate: 305, rank: 1, state: 'accepted' },
          { subId: 'sub-12', name: 'Gunnar Hall',   initials: 'GH', subjects: ['Idrott'],               hourlyRate: 290, rank: 2, state: 'superseded' },
        ],
      },
    };
  }

  // Live mutable state (reset by resetDemo())
  let _state = makeSeed();

  // ----------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------
  function _gap(id) {
    return _state.gaps.find(g => g.id === id) || null;
  }

  function _candidates(gapId) {
    return (_state.candidates[gapId] || []).slice().sort((a, b) => a.rank - b.rank);
  }

  function _candidate(gapId, subId) {
    return (_state.candidates[gapId] || []).find(c => c.subId === subId) || null;
  }

  // Count distinct sub IDs that are NOT currently in an 'accepted' state
  // across any gap (i.e. not booked right now today)
  function _countAvailableSubs() {
    const booked = new Set();
    for (const gapId of Object.keys(_state.candidates)) {
      for (const c of _state.candidates[gapId]) {
        if (c.state === 'accepted') booked.add(c.subId);
      }
    }
    const allSubs = new Set();
    for (const gapId of Object.keys(_state.candidates)) {
      for (const c of _state.candidates[gapId]) {
        allSubs.add(c.subId);
      }
    }
    return allSubs.size - booked.size;
  }

  // ----------------------------------------------------------
  // PUBLIC ADAPTER API
  // ----------------------------------------------------------
  window.Adapter = {

    // ── Auth ─────────────────────────────────────────────────

    getCurrentUser() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    login(email, _code) {
      // MOCK — accepts anything; blank → demo address.
      // Replace with Supabase auth at integration.
      const identifier = (email && email.trim()) || 'demo@vikariekollen.se';
      // Derive a friendly name from the email local-part (stand-in for real name)
      const local = identifier.split('@')[0];
      const name  = local.split(/[._-]+/).filter(Boolean)
                         .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Koordinator';
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: identifier, name }));
      return { ok: true };
    },

    logout() {
      sessionStorage.removeItem(SESSION_KEY);
    },

    // ── School settings ──────────────────────────────────────

    getSchoolDefaultMode() {
      // Real: SELECT cover_offer_mode FROM school_settings WHERE school_id = get_user_school_id()
      return localStorage.getItem(MODE_KEY) || 'cascade';
    },

    setSchoolDefaultMode(mode) {
      // Real: UPDATE school_settings SET cover_offer_mode = mode WHERE school_id = get_user_school_id()
      localStorage.setItem(MODE_KEY, mode);
      return { ok: true };
    },

    // ── Stats ────────────────────────────────────────────────

    getStats() {
      // Derived entirely from live _state — not hardcoded.
      const openGaps     = _state.gaps.filter(g => g.status !== 'filled').length;
      const offersOut    = _state.gaps.filter(g => g.status === 'cascade' || g.status === 'open_pool').length;
      const filledToday  = _state.gaps.filter(g => g.status === 'filled').length;
      const subsAvailable = _countAvailableSubs();
      return { openGaps, offersOut, filledToday, subsAvailable };
    },

    // ── Gaps ─────────────────────────────────────────────────

    getGaps() {
      // Real: SELECT co.*, ap.teacher_name, cr.subject, cr.group_name
      //        FROM cover_offers co
      //        LEFT JOIN cover_records cr ON co.cover_record_id = cr.id
      //        LEFT JOIN absence_periods ap ON co.absence_period_id = ap.id
      //        WHERE co.school_id = get_user_school_id()
      //        ORDER BY co.date, co.start_time
      return _state.gaps.slice();
    },

    // ── Candidates ───────────────────────────────────────────

    getCandidates(gapId) {
      // Real: SELECT * FROM match_cover_candidates(p_offer_id := gapId)
      //       joined with cover_offer_targets for current state
      return _candidates(gapId);
    },

    // ── sendOffer ────────────────────────────────────────────
    // Real: INSERT INTO cover_offer_targets (one per matched sub) then invoke
    // the cover-offer-tick edge function which fires 46elks SMS / Resend email.
    // cascade mode: only rank-1 target gets state='sent', rest stay 'pending'.
    // open_pool mode: all targets set to 'sent' simultaneously.

    sendOffer(gapId) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };

      const candidates = _candidates(gapId);
      if (candidates.length === 0) return { ok: false, error: 'No candidates' };

      if (gap.mode === 'cascade') {
        // Contact rank-1 only; rest are queued
        candidates.forEach((c, i) => {
          c.state = i === 0 ? 'contacted' : 'queued';
        });
        gap.status = 'cascade';
      } else if (gap.mode === 'open_pool') {
        // Contact all simultaneously
        candidates.forEach(c => { c.state = 'contacted'; });
        gap.status = 'open_pool';
      }

      return { ok: true };
    },

    // ── simulateResponse ─────────────────────────────────────
    // Real: triggered by the sub tapping their tokenized SMS/email link.
    // The link hits a Supabase edge function with ?token=<response_token>
    // which calls accept_cover_offer(token) or decline_cover_offer(token) RPC.
    // The edge function handles cascade advancement automatically.

    simulateResponse(gapId, subId, kind) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      const c = _candidate(gapId, subId);
      if (!c) return { ok: false, error: 'Candidate not found' };
      const all = _candidates(gapId);

      if (kind === 'accept') {
        // accept_cover_offer RPC path:
        // mark winner, fill gap, supersede everyone else
        c.state = 'accepted';
        gap.status = 'filled';
        gap.filledBySubName = c.name;
        all.forEach(other => {
          if (other.subId !== subId && other.state !== 'declined') {
            other.state = 'superseded';
          }
        });
        // Mock write-back: in production this inserts cover_assignments and
        // updates absence_periods.covering_sub_id (see accept_cover_offer RPC).

      } else if (kind === 'decline') {
        // decline_cover_offer RPC path:
        c.state = 'declined';

        if (gap.mode === 'cascade') {
          // cover-offer-tick advances cascade: release next 'queued' → 'contacted'
          const nextQueued = all.find(x => x.state === 'queued');
          if (nextQueued) {
            nextQueued.state = 'contacted';
          } else {
            // No more queued subs — pool exhausted, gap stays in cascade
            gap.status = 'cascade'; // remains; UI shows exhausted hint
          }
        }
        // open_pool: others already contacted; gap stays open_pool
      }

      return { ok: true };
    },

    // ── adminAssign ──────────────────────────────────────────
    // Real: admin_assign_cover(p_offer_id, p_sub_id) RPC.
    // No SMS/email needed — coordinator picks directly.
    // Still writes back to cover_assignments + absence_periods.

    adminAssign(gapId, subId) {
      const gap = _gap(gapId);
      if (!gap) return { ok: false, error: 'Gap not found' };
      const c = _candidate(gapId, subId);
      if (!c) return { ok: false, error: 'Candidate not found' };
      const all = _candidates(gapId);

      c.state = 'accepted';
      gap.status = 'filled';
      gap.filledBySubName = c.name;
      all.forEach(other => {
        if (other.subId !== subId) other.state = 'superseded';
      });

      return { ok: true };
    },

    // ── Demo reset ───────────────────────────────────────────

    resetDemo() {
      _state = makeSeed();
    },

    // ── Internal hook for simulated gap injection (demo only) ─
    // Called by app.js's "Simulera ny lucka" path. Not part of the
    // real integration contract — remove at integration.

    _addSimGap(gap) {
      _state.gaps.unshift(gap);
      // Seed two mock candidates for the new gap so it's interactive
      _state.candidates[gap.id] = [
        { subId: 'sub-sim-1', name: 'Simone Vikarie', initials: 'SV',
          subjects: [gap.subject], hourlyRate: 295, rank: 1, state: 'pending' },
        { subId: 'sub-sim-2', name: 'Demo Ersättare', initials: 'DE',
          subjects: [gap.subject], hourlyRate: 280, rank: 2, state: 'pending' },
      ];
    },

  };

}());
