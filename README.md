# Vikariekollen — Substitute Offer & Booking Module

**Status:** front-end skeleton, mock-only. Nothing is wired to a real backend.  
No Supabase, no SMS, no email, no network calls. All data is in-memory and resets on "Återställ demo".

## What it is

Coordinator-facing tool for managing substitute cover offers. Given a gap (absent teacher), the coordinator can:

- See ranked matching substitutes
- Choose a mode: **Kaskad** (contact in order), **Öppen pool** (contact all at once), or **Admin tillsätter** (pick directly)
- Send an offer (simulated — in production this fires 46elks SMS + Resend email)
- Simulate a substitute accepting or declining
- Admin-assign a sub directly (no SMS needed)

Actions requiring a real integration open an explanatory popup with a "Simulera" button so the full flow is walkable in the demo.

## How to run

Open `index.html` directly in a browser (file://) — no build step, no dependencies.

Or serve it locally:

```
python -m http.server 3320
```

Then open `http://localhost:3320`.

## File inventory

| File | Role |
|---|---|
| `index.html` | Shell — loads `adapter.js` then `app.js` |
| `adapter.js` | **Data layer — the only file to reimplement at integration** |
| `app.js` | All UI: login, board, offer panel, modal, i18n. Storage-agnostic. |
| `styles.css` | FVK-branded styling. Extends the sibling Frånvarokollen palette exactly. |
| `README.md` | This file |
| `INTEGRATION_HANDOFF.md` | Full integration guide for the developer wiring the real backend |

## Mock data

- **Matematik 8B** (Anna Lindqvist) — cascade mid-flight; rank-1 Erik Karlsson already contacted
- **Engelska 7A** (Per Magnusson) — open, not sent yet, cascade mode
- **Biologi 9A** (Karin Svensson) — open, not sent yet, open-pool mode
- **Idrott 9C** (Jonas Ek) — already filled by Lars Ek (admin-assigned)
