# Match.Point – Co-Founder Speed-Dating Scheduler

Live: https://vinipoo.github.io/Match.Point/

React SPA (Vite) that runs fully in the browser. State auto-saves to localStorage, so a page refresh during the event loses nothing.

```bash
npm install
npm run dev      # http://localhost:5190
npm run build    # static build in dist/
```

## Structure
- `src/engine/scoring.js` – hard filters + 0–100 pair score (weights 45/25/15/10/5) + explainability tags
- `src/engine/scheduler.js` – per-round weighted matching (fairness + scarcity boosts) with local search (2-swap + augmenting), must-match/lock handling, preserve-mode re-run, gap analysis
- `src/lib/io.js` – CSV/XLSX import (Hebrew or English headers), XLSX/CSV exports, WhatsApp text
- `src/tabs/*` – the 5 tabs; `src/data/demo.js` – 24 demo participants
