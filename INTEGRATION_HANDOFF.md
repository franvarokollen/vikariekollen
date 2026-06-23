# Vikariekollen — Substitute Offer & Booking Module · Integration Handoff

**Audience:** the developer (or AI coding assistant) integrating this module against the real Frånvarokollen / Vikariekollen backend.  
**Status:** working front-end prototype, fully self-contained (plain HTML/CSS/JS, no build step, no dependencies). Open `index.html` directly, or `python -m http.server 3320`.

> **TL;DR for an AI assistant working in the FVK repo:** This is the coordinator-facing offer & booking interface for Vikariekollen. The entire UI talks to storage through **one file — `adapter.js`** — which currently uses in-memory mock data. To integrate, **reimplement the functions in `adapter.js`** against the Supabase schema in `vikariekollen_schema.sql` (tables `cover_offers`, `cover_offer_targets`; RPCs `match_cover_candidates`, `accept_cover_offer`, `decline_cover_offer`, `admin_assign_cover`; edge function `cover-offer-tick`; SMS via 46elks; email via Resend). **Do not change `app.js` or the UI.** The data contract, schema mapping, security model, and integration checklist are below.

---

## 1. What this module is

When a teacher is marked absent in Frånvarokollen, a *gap* (cover need) is created. This module is the coordinator's control plane for filling that gap with a substitute. Three offer modes are supported:

- **Kaskad (cascade):** substitutes contacted one at a time in ranked order. The next is contacted only when the previous declines or times out.
- **Öppen pool (open_pool):** all matched substitutes contacted simultaneously. First to accept wins.
- **Admin tillsätter (admin_assign):** coordinator picks a sub directly. No SMS/email required.

When filled, the result is written back to Frånvarokollen's `cover_assignments` table and the relevant `absence_periods.covering_sub_id` is updated. Substitutes respond via a tokenized link in their SMS or email — they never log into the coordinator portal.

---

## 2. Architecture — the integration seam

```
 index.html ── loads ──► adapter.js  (DATA LAYER — the only file you rewrite)
                          ▲
                          │  app.js calls ONLY window.Adapter.*
 app.js  (UI) ────────────┘  — never touches Supabase/localStorage directly
 styles.css (FVK-branded)
```

`app.js` is storage-agnostic. It calls `window.Adapter.<fn>()` exclusively. The integration surface is **just the Adapter contract** in §4.

---

## 3. Data model & schema

The canonical schema is `vikariekollen_schema.sql`. Key tables:

### `cover_offers`
One row per gap. Fields that matter to the adapter:
- `id`, `school_id`, `date`, `start_time`, `end_time`, `subject`, `group_name`
- `mode` — `'admin_assign'|'open_pool'|'cascade'` (copied from `school_settings.cover_offer_mode` at creation)
- `status` — `'open'|'filled'|'expired'|'cancelled'` (maps to UI statuses `open_unsent`/`cascade`/`open_pool`/`filled`)
- `filled_by_sub_id`, `fill_assignment_id`, `filled_at`
- Anchored via `cover_record_id` OR `absence_period_id` (at least one required)

### `cover_offer_targets`
Fan-out table — one row per sub contacted for a given offer.
- `offer_id`, `sub_id`, `rank` (cascade order), `channel` (`'sms'|'email'`)
- `response_token` — unique UUID per row; used in the tokenized accept/decline link
- `state` — `'pending'|'sent'|'accepted'|'declined'|'expired'|'superseded'`
- `step_expires_at` — per-sub cascade timeout

### `school_settings`
`cover_offer_mode` column (added by schema migration): the school's default offer mode.

---

## 4. Adapter contract — implement exactly these

Signatures and return shapes must stay identical (the UI depends on them). Functions may become **async** at integration; if they return Promises, `await` them at every call site in `app.js` — that is the only permitted change to `app.js`.

| Function | Returns | Real backend mapping |
|---|---|---|
| `getCurrentUser()` | `{ email, name } \| null` | FVK Supabase auth session → coordinator user record |
| `login(email, code)` | `{ ok, error? }` | FVK auth (Supabase; replace bypass) |
| `logout()` | `void` | `supabase.auth.signOut()` |
| `getSchoolDefaultMode()` | `'admin_assign'\|'open_pool'\|'cascade'` | `SELECT cover_offer_mode FROM school_settings WHERE school_id = get_user_school_id()` |
| `setSchoolDefaultMode(mode)` | `{ ok }` | `UPDATE school_settings SET cover_offer_mode = mode` |
| `getStats()` | `{ openGaps, offersOut, filledToday, subsAvailable }` | Derived from `cover_offers` counts for the school; `subsAvailable` from `external_subs` not in a confirmed `cover_assignment` today |
| `getGaps()` | `Gap[]` | `SELECT co.*, ap.teacher_name … FROM cover_offers co LEFT JOIN absence_periods … WHERE co.school_id = get_user_school_id() ORDER BY date, start_time` |
| `getCandidates(gapId)` | `Candidate[]` | `SELECT * FROM match_cover_candidates(p_offer_id := gapId)` joined with `cover_offer_targets` for current state |
| `sendOffer(gapId)` | `{ ok }` | `INSERT INTO cover_offer_targets` (one per matched sub) then invoke `cover-offer-tick` edge function → 46elks SMS / Resend email |
| `simulateResponse(gapId, subId, 'accept')` | `{ ok }` | Call `accept_cover_offer(response_token)` RPC (triggered by sub's tokenized link) |
| `simulateResponse(gapId, subId, 'decline')` | `{ ok }` | Call `decline_cover_offer(response_token)` RPC + edge function advances cascade |
| `adminAssign(gapId, subId)` | `{ ok }` | `SELECT admin_assign_cover(p_offer_id, p_sub_id)` RPC |
| `resetDemo()` | `void` | No-op at integration (remove or guard behind a dev flag) |

### Gap shape
```js
{
  id, teacherName, teacherInitials, subject, group, date,   // ISO date
  startTime,   // "HH:MM"
  endTime,     // "HH:MM"
  lessonCount,
  status,      // 'open_unsent' | 'cascade' | 'open_pool' | 'filled'
  mode,        // 'admin_assign' | 'open_pool' | 'cascade'
  filledBySubName  // string | null
}
```

> **UI status mapping:** `cover_offers.status = 'open'` AND no targets sent → `'open_unsent'`. `'open'` AND cascade targets exist → `'cascade'`. `'open'` AND open_pool targets exist → `'open_pool'`. `cover_offers.status = 'filled'` → `'filled'`.

### Candidate shape
```js
{
  subId, name, initials, subjects,  // string[]
  hourlyRate,  // int kr/h
  rank,        // 1..n
  state        // 'pending'|'queued'|'contacted'|'accepted'|'declined'|'superseded'
}
```

---

## 5. Key RPC behaviour (from `vikariekollen_schema.sql`)

### `accept_cover_offer(p_token uuid)` → assignment_id
- Locks the `cover_offers` row `FOR UPDATE` — serializes concurrent accepts
- Checks offer is still `'open'` and target is not `expired/superseded/declined`
- Inserts `cover_assignments` row (the FVK write-back)
- Updates `cover_offers.status = 'filled'`, sets `filled_by_sub_id`, `fill_assignment_id`, `filled_at`
- If `absence_period_id` present: sets `absence_periods.covering_sub_id`
- Marks winning target `'accepted'`; supersedes all other `pending/sent` targets

### `decline_cover_offer(p_token uuid)` → void
- Marks the target `'declined'`
- The `cover-offer-tick` edge function then reads the next `pending` target by rank and sends the next SMS (cascade advancement)

### `admin_assign_cover(p_offer_id, p_sub_id)` → assignment_id
- Same write-back as accept path
- Runs under the coordinator's session (RLS still applies via `get_user_school_id()`)
- No SMS/email required
- Supersedes any existing pending targets

### `match_cover_candidates(p_offer_id)` → table
Filters: same `school_id`, subject match against `external_subs.subjects`, available weekday, `sub_activations` row exists for the date, not already on a confirmed `cover_assignment` that day. Ranks by `hourly_rate asc` (placeholder — reliability score pipeline pending).

---

## 6. Security model

- **RLS on `cover_offers` and `cover_offer_targets`:** `school_isolation` policy — `USING (school_id = get_user_school_id())`. Portal coordinators read only their own school's data.
- **NO `anon` or `authenticated` broad policies** on these tables. External subs (no `auth.users` row) go through SECURITY DEFINER RPCs only — never direct table access.
- **`response_token`** is the sole credential for the accept/decline path. Treat it like a short-lived secret: single-use (state transitions away from `sent` on first use), no auth required at the edge function endpoint.
- **`match_cover_candidates`** and all offer-mutation RPCs are `SECURITY DEFINER set search_path = public` — they run under the service role for the write-back but validate `school_id` internally.
- SMS = **46elks** (not yet built). Email = **Resend** (not yet built). Both triggered by the `cover-offer-tick` edge function.

---

## 7. `cover-offer-tick` edge function (unbuilt)

This edge function is the orchestration layer. It must:
1. On offer creation (after `sendOffer`): send initial SMS/email to rank-1 target (cascade) or all targets (open_pool) via 46elks / Resend.
2. On decline (after `decline_cover_offer`): find the next `pending` target by rank, flip to `sent`, send SMS.
3. On step timeout (`step_expires_at`): expire the timed-out target and advance cascade.
4. On offer expiry (`expires_at`): mark the whole offer `'expired'`.

Trigger it on: `POST /functions/v1/cover-offer-tick` with `{ offerId, action: 'send'|'advance'|'expire' }`.

---

## 8. i18n & branding

- **Bilingual (SV default / EN):** all strings in `i18n.sv` / `i18n.en` in `app.js`, selected via `t()`, SV/EN toggle persisted in `localStorage['vk_lang']`. Fold into FVK's i18n system at integration.
- **Branding matches FVK exactly:** same CSS variables, same 3×3-squares SVG logo, same card/header/banner patterns. Swap for FVK's shared components if preferred; the CSS variables are identical.
- **localStorage prefix:** `vk_` (vs `fvk_` in the sibling module) to avoid key collisions when both modules run in the same origin.

---

## 9. Integration checklist

1. Rewrite `adapter.js` against Supabase + FVK auth, preserving every signature in §4. Make functions `async` where needed and `await` at call sites in `app.js`.
2. Wire `getCurrentUser()` to FVK Supabase auth session; return coordinator name from the `users` table.
3. Map `getGaps()` → `cover_offers` join query scoped by `get_user_school_id()`; map UI statuses from DB status + targets state (§4 mapping note).
4. Implement `getCandidates()` → `match_cover_candidates` RPC + join `cover_offer_targets` for current state.
5. Implement `sendOffer()` → insert `cover_offer_targets` rows then invoke `cover-offer-tick` edge function.
6. Wire `simulateResponse(accept)` → call `accept_cover_offer(response_token)` via the sub's tokenized link (edge function endpoint).
7. Wire `simulateResponse(decline)` → `decline_cover_offer(response_token)` + tick to advance cascade.
8. Wire `adminAssign()` → `admin_assign_cover` RPC.
9. Build the `cover-offer-tick` edge function (§7); integrate 46elks + Resend.
10. Remove `resetDemo()` and `_addSimGap()` or guard behind a dev flag.
11. Verify security: coordinators can only read their school's offers; subs can only act via their `response_token`; no broad `anon/authenticated` policies on offer tables.
12. Verify write-back: accepting a sub inserts `cover_assignments` and updates `absence_periods.covering_sub_id`.

---

## 10. File inventory

| File | Role |
|---|---|
| `index.html` | Shell — loads `adapter.js` then `app.js` |
| `adapter.js` | **Data layer — the only file to reimplement.** Contract documented in its header + §4 above. |
| `app.js` | All UI: login, board, stats, gap rows, offer panel, modal, i18n, lang toggle. Storage-agnostic. |
| `styles.css` | FVK-branded styling — same CSS variables as sibling module, plus VK-specific components. |
| `vikariekollen_schema.sql` | Canonical DB schema — `cover_offers`, `cover_offer_targets`, RPCs, RLS. Reference for integration. |
| `README.md` | Short overview + run instructions. |
| `INTEGRATION_HANDOFF.md` | This document. |
