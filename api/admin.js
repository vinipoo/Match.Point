// Staff API – every call needs the x-admin-key header (ADMIN_KEY env var on Vercel).
import * as store from './_lib/store.js';
import { K, PHASES, send, readBody, effectivePhase, checkAdmin, storageProblem, newToken, publicProfile } from './_lib/util.js';

async function status() {
  const [ev, roster, tokens, pitched, schedule] = await Promise.all([
    store.get(K.event), store.get(K.roster), store.get(K.tokens), store.get(K.pitched), store.get(K.schedule),
  ]);
  const ids = (roster || []).map((p) => p.id);
  const prefs = await store.mget(ids.map(K.prefs));
  const submissions = ids
    .map((id, i) => (prefs[i]?.list ? { id, list: prefs[i].list, at: prefs[i].at } : null))
    .filter(Boolean);
  const idToToken = Object.fromEntries(Object.entries(tokens || {}).map(([t, id]) => [id, t]));
  return {
    storage: store.mode,
    storageError: storageProblem(),
    serverNow: new Date().toISOString(),
    event: { maxChoices: 5, ...(ev || {}), phase: effectivePhase(ev) },
    rosterIds: ids,
    tokens: idToToken,
    pitched: pitched || [],
    submissions,
    schedule: schedule ? { publishedAt: schedule.publishedAt, count: schedule.meetings.length, hash: schedule.hash } : null,
  };
}

export default async function handler(req, res) {
  try {
    const auth = checkAdmin(req);
    if (!auth.ok) return send(res, auth.code, { error: auth.error });
    const action = req.query?.action;
    const problem = storageProblem();
    if (problem && action !== 'status') return send(res, 503, { error: problem });
    const b = req.method === 'POST' ? readBody(req) : {};
    const now = new Date().toISOString();

    switch (action) {
      case 'status':
        return send(res, 200, await status());

      case 'roster': {
        if (!Array.isArray(b.participants) || !b.participants.length) return send(res, 400, { error: 'רשימת משתתפים ריקה' });
        const roster = b.participants.map(publicProfile);
        const tokens = (await store.get(K.tokens)) || {};
        const idToToken = Object.fromEntries(Object.entries(tokens).map(([t, id]) => [id, t]));
        for (const p of roster) {
          if (!idToToken[p.id]) {
            const t = newToken();
            tokens[t] = p.id;
            idToToken[p.id] = t;
          }
        }
        // last 4 phone digits only (never the full number) – used for the name + 4 digits login
        const auth = Object.fromEntries(b.participants
          .map((p) => [String(p.id), String(p.last4 || '').replace(/\D/g, '').slice(-4)])
          .filter(([, d]) => d.length === 4));
        const ev = (await store.get(K.event)) || { phase: 'setup', maxChoices: 5 };
        await Promise.all([
          store.set(K.roster, roster), store.set(K.tokens, tokens), store.set(K.auth, auth),
          store.set(K.event, { ...ev, rosterAt: now }),
        ]);
        return send(res, 200, await status());
      }

      case 'phase': {
        if (!PHASES.includes(b.phase)) return send(res, 400, { error: 'שלב לא חוקי' });
        const ev = (await store.get(K.event)) || { maxChoices: 5 };
        const next = { ...ev, phase: b.phase };
        if (b.maxChoices) next.maxChoices = Math.max(1, Math.min(10, Number(b.maxChoices)));
        if (b.phase === 'open') {
          // optional display-only timer: 0 / missing = no countdown
          const minutes = Math.min(120, Math.max(0, Number(b.minutes) || 0));
          next.closesAt = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
          next.openedAt = next.openedAt && ev.phase === 'open' ? next.openedAt : now;
        }
        if (b.phase !== 'open') next.closesAt = null;
        await store.set(K.event, next);
        return send(res, 200, await status());
      }

      case 'pitched': {
        const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String))] : [];
        await store.set(K.pitched, ids);
        return send(res, 200, { pitched: ids });
      }

      case 'schedule': {
        if (!Array.isArray(b.meetings) || !Array.isArray(b.times)) return send(res, 400, { error: 'לוח שיבוץ חסר' });
        const schedule = {
          meetings: b.meetings.map((m) => ({ round: Number(m.round), table: Number(m.table), a: String(m.a), b: String(m.b), wild: !!m.wild })),
          times: b.times.map((t) => ({ round: Number(t.round), start: String(t.start), end: String(t.end) })),
          hash: String(b.hash || ''),
          publishedAt: now,
        };
        const ev = (await store.get(K.event)) || {};
        await Promise.all([store.set(K.schedule, schedule), store.set(K.event, { ...ev, phase: 'published', publishedAt: now })]);
        return send(res, 200, await status());
      }

      case 'staff': {
        if (req.method === 'POST') {
          await store.set(K.staff, { state: b.state, savedAt: now });
          return send(res, 200, { savedAt: now });
        }
        return send(res, 200, (await store.get(K.staff)) || { state: null });
      }

      case 'reset': {
        const roster = (await store.get(K.roster)) || [];
        await store.del([...roster.map((p) => K.prefs(p.id)), K.schedule, K.pitched]);
        const ev = (await store.get(K.event)) || {};
        await store.set(K.event, { maxChoices: ev.maxChoices || 5, rosterAt: ev.rosterAt, phase: 'setup' });
        return send(res, 200, await status());
      }

      default:
        return send(res, 400, { error: 'פעולה לא מוכרת' });
    }
  } catch (e) {
    return send(res, 500, { error: String(e?.message || e) });
  }
}
