# Vikariekollen — Integration Handoff

**Audience:** the developer (or AI coding assistant) integrating this module against the real
Frånvarokollen / Vikariekollen Supabase backend.  
**Status:** working front-end prototype, mock only (localStorage). Nothing is wired to
Supabase, SMS, or email. Open `index.html` directly, or `python serve.py` (`:3320`).

> **TL;DR for an AI assistant working in the FVK repo:** the entire UI (`app.js` + all
> `views/*.js`) calls `window.VK.Adapter.*` exclusively. `adapter.js` is the data + logic
> layer and the **only file you reimplement**. Rewrite its function bodies against the
> Supabase schema in `vikariekollen_schema.sql`. Do not change any other file. The adapter
> contract, schema, security model, and integration checklist are below.

---

## 1. Architecture and the adapter seam

```
index.html
  └── loads (all defer, in order):
        version.js   — window.VK_BUILD
        adapter.js   — window.Adapter (DATA + LOGIC LAYER)
        shell.js     — window.VK: el / t / lang / fmt / components
        views/*.js   — window.VK.views.*
        app.js       — boot, routing, calls VK.Adapter.* + VK.views.*
```

`app.js` and every view in `views/*.js` call `window.VK.Adapter.*` only. They never touch
`localStorage`, `sessionStorage`, Supabase, or any network directly. **The adapter is the
entire swap boundary.** Replace its function bodies; the UI requires no changes.

### Plugin mode

Vikariekollen is a plugin. It runs in one of two modes, readable/settable at runtime:

- **`standalone`** (default) — VK is isolated. Every data function reads the local mock store
  (`localStorage` seed). This is the shipped demo state; nothing depends on FVK.
- **`plugged_in`** — VK is plugged into Frånvarokollen and FVK is the system of record. The
  data-source functions (`listSubs`, `listStaff`, staff schedules, activations, the absence→gap
  feed, `getSchoolSettings`, `listSubjects`) proxy FVK instead of the local store. VK-owned
  concepts (offers, targets, cascade, assignments, analytics, subjects if FVK has none) stay
  local or write back to FVK via its RPCs.

`Adapter.getPluginMode()` / `Adapter.setPluginMode(mode)` read and persist the flag. The UI
reads it only to show a status badge ("Pluggad i Frånvarokollen" / "Fristående demo"); it
never branches on mode for data. In the mock, `setPluginMode` sets the flag but does not
actually rewire data sources — it documents the seam so the integration has one defined place
to fill in.

### Stack note

VK is vanilla JS with no build step (deliberate: hot-swappable prototype, no toolchain
dependency). FVK is Next.js / React / TypeScript. Two integration paths:

1. **Isolated plugin** — keep VK vanilla; serve it as an iframe, web component, or bundled
   script. Only the adapter is reimplemented against Supabase. Lowest coupling.
2. **Native port** — rebuild the views as React/TS components. The logic and schema port
   cleanly because all data logic is in the adapter; the adapter contract is the spec.

The adapter seam makes either path mechanical.

---

## 2. Adapter contract

All functions are **synchronous in the prototype** (localStorage is sync). At integration most
will become async (Supabase calls return Promises). When that happens, `await` them at every
call site in `app.js` / `views/*.js`. That is the only permitted change to the UI files;
write call sites as `const x = await Adapter.foo()` from the start so the conversion is
search-and-replace.

### Auth / roles

```
getCurrentUser()
  → { email, name, role: 'coordinator'|'sub'|'staff', subId: string|null, staffId: string|null }
  | null

login(email, code, role)
  → { ok: true, user } | { ok: false, error }
  // Demo: bypasses real auth; resolves role + backing record by email.
  // Integration: replace with FVK Supabase auth; role from users.role or claims.

logout()
  → void

getRole()
  → 'coordinator' | 'sub' | 'staff'

setRole(role)
  → { ok: true }
```

### School settings

```
getSchoolSettings()
  → {
      coverOfferMode:    'admin_assign' | 'open_pool' | 'cascade',
      coverSourceTiers:  [{ key: TierKey, enabled: boolean }],   // 4 entries, ordered
      coverSourceMode:   string,   // DERIVED legacy label — do not write this directly
      automationLevel:   'manual' | 'assisted' | 'auto',
      stepMinutes:       number,   // cascade timeout per recipient: 1–20160
      channels:          { sms: boolean, email: boolean },
      smsTemplate:       string,
      emailTemplate:     string,
    }

updateSchoolSettings(patch)
  → { ok: true, settings } | { ok: false, error }
  // coverSourceTiers is canonical; if present it is validated (exactly 4 keys,
  // each once, boolean enabled) and coverSourceMode is re-derived from it.
  // If only coverSourceMode is patched, it is expanded to a tier config (back-compat).
  // stepMinutes validated 1–20160.
```

`TierKey` values and what each pool is:

| Key | Pool |
|---|---|
| `internal_staff` | School's own staff (`staff_members`, roles `coverable` or `teaching`) |
| `fvk_active` | External subs imported from FVK (`origin='fvk'`, `active=true`) |
| `vk_subs` | External subs created in VK (`origin='vk'`) |
| `fvk_inactive` | Imported subs inactive in FVK (`origin='fvk'`, `active=false`) — off by default |

### Subjects (per-school, mutable)

```
listSubjects()
  → [{ name: string, type: 'teaching' | 'duty' }]

addSubject(name, type)
  → { ok: true, subject } | { ok: false, error }
  // Rejects duplicates (case-insensitive). type defaults to 'teaching'.

removeSubject(name)
  → { ok: true } | { ok: false, error }
```

A gap whose subject matches a `duty` entry requires no qualification — every candidate is
marked `qualified: true`. A subject not in the store is treated as `teaching` (qualification
required). Adding or removing a subject takes effect on the next `matchCandidates` call.

### Plugin mode

```
getPluginMode()   → 'standalone' | 'plugged_in'
setPluginMode(m)  → { ok: true, mode } | { ok: false, error }
```

### External subs (the pool)

Each sub carries `origin: 'fvk'|'vk'` and `active: boolean`; together these determine its
tier key.

```
listSubs()
  → Sub[]   // each enriched with: tier, poolLabel, reliabilityScore

getSub(id)        → Sub | null
createSub(data)   → { ok: true, sub } | { ok: false, error }
updateSub(id, patch) → { ok: true, sub } | { ok: false, error }
setSubActive(id, bool) → { ok: true } | { ok: false, error }
deleteSub(id)     → { ok: true } | { ok: false, error }
```

### Staff members (internal cover pool)

```
listStaff(opts?)
  → StaffMember[]
  // opts.coverableOnly: true → only role 'coverable' | 'teaching'
  // Each enriched with: reliabilityScore, coversThisMonth, workloadPct, coverable

getStaff(id)         → StaffMember | null
getStaffSchedule(id) → [{ date, startTime, endTime }]   // busy windows (teaching lessons)
```

### Availability (external subs)

Slot keys: `"<dayIndex>-<hour>"` where dayIndex is 0=Mon..4=Fri and hour is the integer
start hour (8–15). A week's availability is an array of slot keys.

```
getSchedule()                             → { days: string[], hours: number[] }
getDefaultAvailability(subId)             → string[]
saveDefaultAvailability(subId, slots)     → { ok }
getEffectiveAvailability(subId, weekId)   → { slots: string[], source: 'override'|'default' }
saveWeekOverride(subId, weekId, slots)    → { ok }
clearWeekOverride(subId, weekId)          → { ok }
hasWeekOverride(subId, weekId)            → boolean
getWeekId(date: Date)                     → string   // "YYYY-Www"
getWeekMeta(weekId)                       → { label, monday, friday, weekNumber }
```

### Activations

Per-date flag: is this sub available to be offered work today?

```
getActivations(date: string)          → string[]   // subIds activated for that date
setActivation(subId, date, on: bool)  → { ok }
```

### Gaps

```
listGaps(filter?)
  → Gap[]   // sorted by date + startTime
  // filter: { status?, date?, subject? }

getGap(id)           → Gap | null
createGap(data)      → { ok: true, gap } | { ok: false, error }
updateGap(id, patch) → { ok: true, gap } | { ok: false, error }
deleteGap(id)        → { ok: true } | { ok: false, error }

getStats()
  → { openGaps, offersOut, filledToday, subsAvailable }
```

**Gap shape:**
```js
{
  id, teacherName, teacherInitials, subject, group, date,  // ISO date "YYYY-MM-DD"
  startTime, endTime,         // "HH:MM"
  lessonCount,
  periodIds: string[],
  status: 'open_unsent' | 'cascade' | 'open_pool' | 'filled' | 'expired',
  mode:   'admin_assign' | 'open_pool' | 'cascade',
  filledByType: 'external_sub' | 'staff' | null,
  filledById: string | null,
  filledBySubId: string | null,   // external compat alias
  filledBySubName: string | null,
}
```

### Matching

```
matchCandidates(gapId)
  → Candidate[]
```

**Unified candidate shape** (both pools):
```js
{
  recipientType: 'external_sub' | 'staff',
  recipientId: string,
  subId: string | null,        // external compat alias (recipientId for subs, null for staff)
  source: 'internal' | 'external',
  tier: TierKey,
  poolLabel: string,           // human label in SV
  name: string,
  initials: string,
  subjects: string[],
  rate: number,                // kr/h (internalRate for staff, often 0)
  qualified: boolean,          // soft: false = "ej behörig" flag, not exclusion
  reliabilityScore: number,    // 0–100
  rank: number,                // 1..n, ascending
  state: 'pending' | 'queued' | 'contacted' | 'accepted' | 'declined' | 'superseded',
  sentAt: string | null,
  stepExpiresAt: string | null,
  conflict?: 'booked' | 'pending_elsewhere',
  workloadPct?: number,        // staff only
  freeNow?: boolean,           // staff only — has a free period at the gap time
}
```

Ranking: existing offer rank first (preserves live cascade order) → tier index (lower = higher
priority) → qualified desc → reliability desc → rate asc → workload asc → name.

### Offer lifecycle

```
sendOffer(gapId)
  → { ok: true } | { ok: false, error }
  // cascade: rank-1 → 'contacted' (stepExpiresAt set), rest → 'queued'
  // open_pool: all matched → 'contacted' simultaneously
  // admin_assign: use adminAssign() instead

simulateResponse(gapId, subId, 'accept'|'decline')
  → { ok: true, filled: boolean } | { ok: false, error }
  // Back-compat external wrapper; delegates to respond()

respond(gapId, recipientType, recipientId, 'accept'|'decline')
  → { ok: true, filled: boolean } | { ok: false, error }
  // Polymorphic core for both pools. On accept: fills gap, supersedes other
  // targets, writes back assignment. On decline (cascade): releases next queued.

adminAssign(gapId, subId)
  → { ok: true, filled: true } | { ok: false, error }
  // Back-compat external wrapper

adminAssignRecipient(gapId, recipientType, recipientId)
  → { ok: true, filled: true } | { ok: false, error }
  // Direct fill from either pool, no send. Creates/reuses the offer record.

cancelOffer(gapId)
  → { ok: true }

advanceCascade(gapId)
  → { ok: true, released: true }
  | { ok: true, released: false, exhausted: true }
  | { ok: false, error }
  // Manually skip the cascade timer: expires the current contacted target and
  // releases the next queued one (same transition as a natural timeout).
```

### Sub-facing functions

```
getOffersForSub(subId)     → OfferForRecipient[]
subAccept(arg)             → { ok, filled }   // arg: { gapId, subId } or response token string
subDecline(arg)            → { ok, filled }
getBookingsForSub(subId)   → Assignment[]
```

### Staff-facing functions

```
getRequestsForStaff(staffId) → OfferForRecipient[]
staffAccept(arg)             → { ok, filled }   // arg: { gapId, staffId } or response token
staffDecline(arg)            → { ok, filled }
getCoversForStaff(staffId)   → Assignment[]
getStaffWorkload(staffId)    → { coversThisMonth, coverLimit, workloadPct, hoursThisMonth }
```

### Analytics and history

```
listHistory(filter?)
  → AuditEntry[]   // sorted desc by ts
  // filter: { gapId?, subId?, type? }

getAnalytics()
  → {
      fillRate, avgMinutesToFill, totalCostSek, declineRate,
      offersByMode: { admin_assign, open_pool, cascade },
      internalCostSek, externalCostSek, estimatedSavingsSek,
      internalCoverCount, externalCoverCount,
      costByTier: { internal_staff, fvk_active, vk_subs, fvk_inactive },
      coverCountByTier: { … },
    }
```

### Lessons

```
listLessons(filter?)   → Lesson[]   // filter: { date? }
getLesson(id)          → Lesson | null
```

### Simulated clock

The prototype uses a deterministic simulated clock (seeded 2026-06-24 09:00) so cascade
timeouts and analytics are reproducible. The real backend uses real `now()`.

```
now()                     → number   // simulated epoch ms
nowIso()                  → string   // ISO timestamp
advanceClock(minutes)     → { ok, now: string, transitions: number }
tickCascade()             → { ok, transitions: number }
```

At integration, replace `Adapter.now()` call sites with `Date.now()` / `new Date().toISOString()`.

### Demo reset

```
resetDemo()   → { ok: true }
// Reseeds localStorage from the canonical seed. Remove or guard behind a dev flag
// at integration — there is no equivalent on a live database.
```

---

## 3. Supabase schema (`vikariekollen_schema.sql`)

### Additions to existing FVK tables

**`school_settings`** — three new columns (ALTER TABLE, idempotent):
- `cover_offer_mode` — distribution method: `admin_assign | open_pool | cascade`; default `cascade`
- `cover_offer_step_minutes` — cascade timeout per recipient, 1–20160 min; default 15
- `cover_source_mode` — **DERIVED legacy label**; the adapter re-derives it from `cover_source_tiers` on every write; default `internal_first`
- `cover_source_tiers` — JSONB array of `{ key, enabled }` over exactly the four tier keys; the matcher's source of truth; default puts staff first and inactive FVK subs off
- `cover_automation_level` — `manual | assisted | auto`; default `assisted`

**`external_subs`** — two new columns:
- `origin` — `'fvk' | 'vk'`; default `'fvk'`
- `active` — boolean; default `true`

### New tables

**`school_subjects`** — per-school subject catalogue. Columns: `id`, `school_id`, `name`,
`type ('teaching'|'duty')`, `created_at`. Unique index on `(school_id, lower(name))`. RLS:
`school_isolation`. No anon/authenticated policies.

**`cover_offers`** — one row per gap to fill. Key columns: `school_id`, `cover_record_id`,
`absence_period_id` (at least one required — CHECK constraint), `date`, `start_time`,
`end_time`, `subject`, `group_name`, `mode`, `status ('open'|'filled'|'expired'|'cancelled')`,
`filled_by_type ('external_sub'|'staff')`, `filled_by_id`, `filled_by_sub_id` (external
read-compat alias — generated from `filled_by_id` when `filled_by_type = 'external_sub'`),
`fill_assignment_id`, `expires_at`, `filled_at`. RLS: `school_isolation`.

**`cover_offer_targets`** — fan-out table; one row per candidate contacted. Key columns:
`school_id`, `offer_id`, `recipient_type ('external_sub'|'staff')`, `recipient_id`,
`sub_id` (generated column: `recipient_id` for external targets, `NULL` for staff — read-compat
alias for legacy joins), `rank`, `channel`, `response_token` (UUID, used in the tokenized
accept/decline link), `state`, `sent_at`, `responded_at`, `step_expires_at`. Unique on
`(offer_id, recipient_type, recipient_id)`. RLS: `school_isolation`. No anon/authenticated
policies — external subs reach this table only through SECURITY DEFINER RPCs.

### RPCs (all `SECURITY DEFINER SET search_path = public`)

| RPC | What it does |
|---|---|
| `match_cover_candidates(p_offer_id)` | Returns unified candidate rows (both pools) ranked by tier config. Subject qualification is soft — `qualified=false` never excludes, only sorts lower. |
| `accept_cover_offer(p_token uuid)` | Locks the offer `FOR UPDATE` (serializes concurrent accepts), validates token + offer state, writes a `cover_assignments` row back to FVK, marks offer `filled`, sets `filled_by_type/id`, supersedes other targets, updates `absence_periods.covering_sub_id` if present and recipient is external. Returns new assignment id. |
| `decline_cover_offer(p_token uuid)` | Marks the target `declined`. The `cover-offer-tick` edge function then reads the next pending target by rank and sends it (cascade advancement). |
| `admin_assign_cover(p_offer_id, p_recipient_type, p_recipient_id)` | Direct fill from either pool; no fan-out. Same write-back path as accept. Back-compat 2-arg wrapper (`offer_id, sub_id`) assumes `external_sub`. |

---

## 4. Security

Gareth — these are the exact guarantees the current schema provides, and the gaps that must
be addressed before going live.

### What is in place

- **RLS `school_isolation` on every table** (`cover_offers`, `cover_offer_targets`,
  `school_subjects`) — `USING (school_id = get_user_school_id())`. A coordinator can only
  read and write their own school's data.
- **No `anon` or `authenticated` broad policies** on any VK table. External subs (no
  `auth.users` row) cannot access these tables directly under any grant.
- **All RPCs `SECURITY DEFINER` with `set search_path = public`** — they run with elevated
  privilege for the write-back but validate `school_id` internally; `search_path` is pinned
  to prevent schema-injection.
- **External accept/decline via tokenized SECURITY DEFINER RPCs only** — a sub's tokenized
  link calls `accept_cover_offer(token)` or `decline_cover_offer(token)` through an edge
  function. The token resolves the target row internally; no `auth.users` session or direct
  table access is required or possible.
- **`accept_cover_offer` locks the offer row `FOR UPDATE`** — concurrent accepts on the same
  gap are serialized; only the first wins.

### Caveats to address at wiring time

1. **Mock login is a bypass.** `Adapter.login()` in the prototype accepts any credentials and
   sets any role. Replace with real FVK Supabase auth (session token → `auth.users` →
   `users.role`/claims). Until this is done, any user can claim any role.

2. **Polymorphic recipient has no single FK.** `cover_offer_targets.recipient_id` spans
   `external_subs.id` and `staff_members.id` depending on `recipient_type`. There is no
   database-level FK enforcing this. Add a CHECK constraint or `BEFORE INSERT` trigger that
   validates `recipient_id` exists in the correct table for the given `recipient_type`.

3. **`response_token` is not yet enforced as single-use with expiry.** The schema stores it
   as a UUID and the RPC validates target state (a used token transitions state away from
   `sent/pending`), but there is no explicit TTL column or index-enforced single-use lock.
   Add a `token_expires_at` column to `cover_offer_targets` and reject expired tokens in
   `accept_cover_offer` / `decline_cover_offer`.

4. **Per-school settings in a shared table.** `cover_source_tiers`, `cover_offer_mode`,
   `automation_level`, and `step_minutes` are new columns on the existing FVK
   `school_settings` table. Confirm this matches FVK's migration strategy; if `school_settings`
   is managed by FVK and has its own migration pipeline, coordinate the ALTER TABLE additions
   to avoid conflicts.

---

## 5. What's mock vs real

| Concern | Prototype (mock) | Integration (real) |
|---|---|---|
| Data store | `localStorage` (`vk_store_v1`, `vk_subjects`, `vk_plugin_mode`) | Supabase tables per schema |
| Auth | Bypass — any email/code accepted | FVK Supabase auth session |
| SMS | Logged to audit only | 46elks via `cover-offer-tick` edge function |
| Email | Logged to audit only | Resend via `cover-offer-tick` edge function |
| Cascade advancement | `_tickCascade()` runs in the browser on `advanceClock()` calls | `cover-offer-tick` edge function triggered by cron + webhooks |
| `response_token` | `Math.random()`-based string | `gen_random_uuid()` (schema already does this) |
| Reliability score | Computed live from in-memory audit log | Computed from `cover_offer_targets` history; placeholder 50 in the SQL RPC until the audit pipeline is wired |
| Write-back to FVK | In-memory `assignments[]` array | INSERT into `cover_assignments`, UPDATE `absence_periods.covering_sub_id` |
| `resetDemo()` | Reseeds localStorage | Remove or guard behind a `NODE_ENV !== 'production'` flag |

---

## 6. Integration checklist

1. **Reimplement `adapter.js`** against Supabase, preserving every function signature in §2.
   Make functions `async` where needed; `await` at every call site in `app.js` / `views/*.js`.
2. **Wire real auth + roles** — replace the demo bypass in `login()` with FVK Supabase auth;
   resolve `subId` / `staffId` from the authenticated session.
3. **Apply the schema** — run `vikariekollen_schema.sql` against the FVK Supabase project.
   Confirm the `school_settings` ALTER TABLE additions are consistent with FVK's migration
   pipeline.
4. **Address the security caveats** in §4 before any real data is handled:
   - Replace the mock login bypass with real auth
   - Add a CHECK/trigger validating the polymorphic recipient FK
   - Add `token_expires_at` and enforce single-use on `response_token`
   - Confirm `school_settings` additions are coordinated with FVK
5. **Choose the plugin path** — isolated (iframe/bundle, swap adapter only) or native port
   (rebuild views as React/TS). The adapter contract is identical either way.
6. **Wire `cover-offer-tick` edge function** — this is the orchestration layer for sends,
   cascade advancement, and timeouts. It must: send SMS/email to rank-1 (cascade) or all
   (open pool) on `sendOffer`; advance the cascade on decline or `step_expires_at` timeout;
   expire the whole offer on `expires_at`. Trigger on `POST /functions/v1/cover-offer-tick`
   with `{ offerId, action: 'send'|'advance'|'expire' }`.
7. **Wire SMS via 46elks** and **email via Resend** inside the edge function.
8. **Surface write-back into FVK** — `accept_cover_offer` already inserts into
   `cover_assignments` and updates `absence_periods.covering_sub_id`; verify these columns
   exist in the FVK baseline and that the RPC's INSERT matches FVK's `cover_assignments`
   column set.
9. **Remove `resetDemo()`** or guard it behind a dev flag. It should not be callable in
   production.
10. **Replace `Adapter.now()` / `advanceClock()`** — the simulated clock is only for the
    demo. Real timestamps come from `Date.now()` / Supabase `now()`.

---

## 7. File inventory

| File | Role |
|---|---|
| `index.html` | Entry point; load order documented in its `LOAD ORDER` comment |
| `version.js` | `window.VK_BUILD` — bump `build` integer on every change |
| `adapter.js` | **The swap boundary. Reimplement this file only.** |
| `shell.js` | `window.VK`: `el`, `t`, `lang`, `fmt`, `components` |
| `app.js` | Boot, routing, nav shell. Calls `VK.Adapter.*` and `VK.views.*`. |
| `views/board.js` | Coordinator board view — gap cards, offer panel, candidate list |
| `views/pool.js` | Coordinator pool view — sub list, availability grid, activations |
| `views/settings.js` | Coordinator settings — distribution mode, tier config, subjects, automation, simulated clock |
| `views/history.js` | Coordinator analytics + filterable audit log |
| `views/sub.js` | Substitute views — offers, bookings, availability |
| `views/staff.js` | Internal staff views — requests, covers, workload |
| `styles.css` + `views/*.css` | FVK-brand styles; no build step required |
| `serve.py` | No-cache dev server on `:3320` |
| `vikariekollen_schema.sql` | Canonical Supabase schema — apply at integration |
