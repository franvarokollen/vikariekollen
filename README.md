# Vikariekollen — Substitute Offer & Booking Module

**Status:** working front-end prototype, mock only. No Supabase, no SMS, no email, no network
calls. All data lives in `localStorage` under `vk_*` keys and resets with "Återställ demo".  
**Build:** v0.6.0 · build 4 · 2026-06-24

---

## What it is

Vikariekollen is the **"missing middle"** between a logged absence and a covered lesson. When
a teacher is marked absent in Frånvarokollen (FVK), a *gap* is created. Vikariekollen turns
that gap into a matched offer, gets a substitute to accept, and writes the result back to FVK.

It is designed as a **plugin** that bolts onto FVK. In this prototype it runs standalone with
mock data; the adapter seam (see [INTEGRATION_HANDOFF.md](INTEGRATION_HANDOFF.md)) is the
only thing that changes when wired to the real backend.

Three roles are supported — each sees a different set of screens:

| Role | Screens (Swedish tab names) |
|---|---|
| **Coordinator** | Tavla (board), Vikarier (pool + availability), Inställningar (settings), Historik (analytics) |
| **Substitute** (external) | Mina erbjudanden, Mina pass, Min tillgänglighet |
| **Staff** (internal) | Förfrågningar, Mina vikariat, Min arbetsbörda |

### Coordinator screens

- **Tavla** — gap board with headline metrics (open gaps, offers out, filled today, subs
  available). Each gap card shows status, matched candidates by tier, and the full offer
  lifecycle: send, simulate accept/decline, admin-assign, advance cascade. Mode is
  selectable per-gap while no offer is live; locked once sent.
- **Vikarier** — the full substitute pool. Add, edit, activate/deactivate, delete. Per-sub
  weekly default availability grid and per-week overrides. Date-level activation toggles.
- **Inställningar** — three independent configuration axes: offer distribution mode
  (cascade / open pool / admin assign), candidate source tiers (ordered, toggleable four-pool
  config), and automation level. Also manages the per-school subjects catalogue and the
  plugin-mode toggle (standalone vs plugged in to FVK). Simulated-clock controls for
  demoing cascade timeouts.
- **Historik** — analytics dashboard (fill rate, avg minutes to fill, decline rate, cost,
  internal-vs-external savings) and a filterable audit-event log.

### Substitute screens

- **Mina erbjudanden** — live offers sent to this sub (contacted or queued), with gap detail
  and respond-by deadline. Accept and decline buttons simulate the tokenized-link response.
- **Mina pass** — confirmed upcoming bookings with lesson and cost detail.
- **Min tillgänglighet** — default weekly availability grid plus per-week overrides (same
  data the coordinator sees in the pool view).

### Staff screens

- **Förfrågningar** — cover requests sent to this internal staff member, with accept/decline.
- **Mina vikariat** — confirmed covers this staff member has agreed to.
- **Min arbetsbörda** — monthly cover count vs limit and estimated hours.

---

## Key concepts

**Four candidate pools, ordered by tier config**

| Tier key | What it is |
|---|---|
| `internal_staff` | School's own teaching/coverable staff with a free period at the gap time |
| `fvk_active` | External subs imported from FVK (`origin='fvk'`, `active=true`) |
| `vk_subs` | External subs created inside Vikariekollen (`origin='vk'`) |
| `fvk_inactive` | Imported subs marked inactive in FVK — last-resort pool, off by default |

The coordinator reorders and toggles these tiers in Settings; the default puts internal staff
first (cheaper, no agency cost).

**Three offer distribution modes**

- **Cascade** — contact one candidate at a time in rank order; next is contacted when the
  previous declines or their step timer expires. Step duration is configurable (1 min for
  urgency up to 14 days for advance planning).
- **Open pool** — all matched candidates contacted simultaneously; first to accept wins.
- **Admin assign** — coordinator picks directly; no SMS/email required.

**Three automation levels** (`manual` / `assisted` / `auto`) stored in settings; full
auto-trigger wiring is a future step.

**Subject qualification is soft** — a subject mismatch never excludes a candidate. It is
surfaced as `qualified: false` (shown as "ej behörig" on the card) and sorts below qualified
candidates within the same tier. Non-teaching duties (Rastvakt, Lunchvakt, etc.) are declared
in the subjects catalogue as `type: 'duty'`; a duty gap requires no qualification — every
candidate is eligible.

**Reliability score** — derived from the audit log: base 50, +10 per accept, −5 per decline,
−3 per no-response, clamped 0–100. Internal staff with no history default to 60.

**Write-back** — when a gap is filled (any path), an assignment row is created with cost,
the external-comparable cost for savings analytics, and the pool type flag. Internal covers
record what an external would have cost so savings can be computed.

**Simulated clock** — all business timestamps use `Adapter.now()` (seeded at 2026-06-24
09:00). Advance it in Settings to demo cascade step timeouts without waiting.

---

## How to run

No build step. No dependencies. Three options:

```
# Option 1 — open directly
open index.html          # file:// works for the mock

# Option 2 — no-cache dev server (recommended; serve.py sends Cache-Control: no-store)
python serve.py          # → http://localhost:3320

# Option 3 — standard Python server
python -m http.server 3320
```

The `?v=3` cache-buster on every `<script>` and `<link>` tag handles the case where a
browser pins a stale copy via file://.

---

## File inventory

| File | Role |
|---|---|
| `index.html` | Entry point. Loads scripts in order: `version.js` → `adapter.js` → `shell.js` → `views/*.js` → `app.js` (all `defer`) |
| `version.js` | Exposes `window.VK_BUILD` (`version`, `build`, `date`). Bump `build` on every change. |
| `adapter.js` | **The entire data + business-logic layer.** The only file reimplemented at integration. Calls `window.Adapter.*`. |
| `shell.js` | `window.VK` namespace: `el()` DOM helper, `t()` i18n, `VK.lang`, `VK.fmt` formatters, `VK.components` shared UI primitives. |
| `app.js` | Boot, routing, login screen, nav shell. Calls `VK.Adapter.*` and `VK.views.*` only. |
| `views/board.js` | Coordinator board view |
| `views/pool.js` | Coordinator pool + availability view |
| `views/settings.js` | Coordinator settings view |
| `views/history.js` | Coordinator analytics + audit log view |
| `views/sub.js` | Substitute offers + bookings + availability views |
| `views/staff.js` | Internal-staff requests + covers + workload views |
| `styles.css` | Base + shell styles (FVK brand tokens: navy `#1B4776`, blue `#0F71F6`, red `#E71E3C`, Geist typeface) |
| `views/*.css` | Per-view stylesheets |
| `serve.py` | No-cache dev server on `:3320` |
| `vikariekollen_schema.sql` | Supabase schema: `cover_offers`, `cover_offer_targets`, `school_subjects`, `school_settings` additions, `external_subs` additions, SECURITY DEFINER RPCs |
| `INTEGRATION_HANDOFF.md` | Integration guide for the developer wiring the real backend |

---

## Demo seed

The mock ships with a realistic demo week (2026-W26) covering all gap states and all four
candidate pools:

| Gap | Status |
|---|---|
| Matematik 8B (Anna Lindqvist) · Wed | Cascade mid-flight — internal staff Karin Holm at rank 1, contacted |
| Engelska 7A (Per Magnusson) · Wed | Open, not sent (cascade mode) |
| Rastvakt — (Eva Strand) · Wed | Open duty gap — no qualification required; cascade mode |
| Biologi 9A (Karin Svensson) · Thu | Open pool active |
| Idrott 9C (Jonas Ek) · Tue | Filled — Lars Ek, admin-assigned |
| Historia 7B (Nils Berg) · Mon | Filled by internal staff Johanna Ek (savings analytics seeded) |
| Engelska 8A (Petra Holm) · Mon | Expired — cascade exhausted |
