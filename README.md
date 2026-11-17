# Match.Point – Co-Founder Speed-Dating Scheduler

Live: https://match-point-pied.vercel.app

React (Vite) staff console + mobile participant page, with two Vercel serverless
functions and Upstash Redis for the live event (profiles, preferences, published schedule).

```bash
npm install
npm run dev      # http://localhost:5190 – /api runs locally with in-memory storage, staff key "dev"
npm run build
```

## Event-night flow
1. **Staff console → tab 03**: enter the staff key, *Publish roster* (public profiles only – no phone/email).
   Each participant gets a personal link `/?p=<token>`; send it from the links table (WhatsApp).
2. **Pitches**: tap who pitched – they get a badge and appear first for participants.
3. **Break**: *Open preferences* (15 min, up to 5 ranked choices). Participants browse profiles and pick on their phone;
   every change is saved immediately. Live progress, most-requested and mutual counts on the staff screen.
4. **Close → Pull preferences and run** – choices become ranked preferences (#1 = highest) in the matching engine.
5. **Publish schedule** – each participant's page switches to "My schedule" (round, time, table, partner).
   Re-publish after any change; phones refresh by themselves.

## Vercel setup (one time)
- Project → **Storage** → connect **Upstash Redis** (injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- Project → Settings → **Environment Variables** → `ADMIN_KEY` = the staff password. Redeploy afterwards.

## Structure
- `api/admin.js` – staff API (needs `x-admin-key`): status, roster, phase, pitched, schedule, staff backup, reset
- `api/participant.js` – participant API (personal token): profile list, own preferences, own schedule
- `api/_lib/` – storage (Upstash / in-memory) and helpers
- `src/participant/` – mobile participant page
- `src/engine/scoring.js` – hard filters + 0–100 pair score (weights 45/25/15/10/5) + explainability tags
- `src/engine/scheduler.js` – per-round weighted matching (fairness + scarcity boosts) with local search
- `src/lib/io.js` – CSV/XLSX import (incl. the Google Form registration export), exports, WhatsApp texts
- `src/tabs/*` – the 6 staff tabs; `src/data/demo.js` – 24 demo participants
