# Match.Point – Co-Founder Speed-Dating Scheduler

Live: https://match-point-pied.vercel.app

React (Vite) staff console + mobile participant page, with two Vercel serverless
functions and Upstash Redis for the live event (profiles, preferences, published schedule).

```bash
npm install
npm run dev      # http://localhost:5190 – /api runs locally with in-memory storage, staff key "dev"
npm run build
```

## Links
- **Participants:** the main link `https://match-point-pied.vercel.app` (or the projected QR) → log in with name + last 4 phone digits.
  Personal links `/?p=<code>` skip the login; `/?p=P01` opens the login with the name pre-selected.
- **Staff console:** `https://match-point-pied.vercel.app/?mode=admin`

## Event-night flow
1. **Staff console → tab 03**: enter the staff key, *Publish roster* (public profiles only – no phone/email).
   Each participant gets a personal link `/?p=<token>`; send it from the links table (WhatsApp).
2. **Pitches**: tap 🎤 Pitch next to the person in tab 02 (or in tab 03) – the badge appears on phones within seconds,
   pitchers are listed first. Non-pitchers keep full matching weight (profile fit + fairness).
3. **Break**: *Open preferences* (15 min, up to 5 ranked choices). Participants browse profiles and pick on their phone;
   every change is saved immediately. Live progress, most-requested and mutual counts on the staff screen.
4. **Close → Pull preferences and run** – choices become ranked preferences (#1 = highest) in the matching engine.
   Optional **Wildcard round** (tab 04, round 2 or 3): seeded-random Tech ↔ Business pairs who haven't met, ignoring picks.
5. **🚀 Publish live** (tabs 03 / 05 / 06, plus a projectable QR) – phones switch to "My schedule" (round, time, table, partner).
   Re-publish after any change; phones poll every 10 s and show a magenta alert for changed upcoming rounds.

## Vercel setup (one time)
- Project → **Storage** → connect **Upstash Redis** (injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- Project → Settings → **Environment Variables** → `ADMIN_KEY` = the staff password. Redeploy afterwards.

## Structure
- `api/admin.js` – staff API (needs `x-admin-key`): status, roster, phase, pitched, schedule, staff backup, reset
- `api/participant.js` – participant API (personal token): profile list, own preferences, own schedule
- `api/_lib/` – storage (Upstash / in-memory) and helpers
- `src/participant/` – mobile participant page
- `src/engine/scoring.js` – hard filters + 0–100 pair score (weights 45/25/15/10/5) + explainability tags
- `src/engine/scheduler.js` – rounds 1–3: everyone seated every round (good matches first, then the highest profile score, same side only if needed – never random); later rounds: good matches only, otherwise free networking; local search + Wildcard
- `src/lib/io.js` – CSV/XLSX import (incl. the Google Form registration export), exports, WhatsApp texts
- `src/tabs/*` – the 6 staff tabs; `src/data/demo.js` – 24 demo participants
