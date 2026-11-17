// Participant API – identified only by the personal token in their link.
import * as store from './_lib/store.js';
import { K, send, readBody, effectivePhase, storageProblem } from './_lib/util.js';

async function identify(token) {
  if (!token || typeof token !== 'string' || token.length > 64) return null;
  const tokens = (await store.get(K.tokens)) || {};
  const id = tokens[token];
  if (!id) return null;
  const roster = (await store.get(K.roster)) || [];
  const me = roster.find((p) => p.id === id);
  return me ? { me, roster } : null;
}

export default async function handler(req, res) {
  try {
    const problem = storageProblem();
    if (problem) return send(res, 503, { error: 'המערכת עדיין לא מוכנה. נסו שוב בעוד רגע.' });

    if (req.method === 'GET') {
      const who = await identify(req.query?.t);
      if (!who) return send(res, 404, { error: 'הקישור לא תקין או שפג תוקפו. פנו לצוות האירוע.' });
      const { me, roster } = who;
      const [ev, prefs, pitched, schedule] = await Promise.all([
        store.get(K.event), store.get(K.prefs(me.id)), store.get(K.pitched), store.get(K.schedule),
      ]);
      const phase = effectivePhase(ev);
      let mySchedule = null;
      if (phase === 'published' && schedule) {
        const byId = Object.fromEntries(roster.map((p) => [p.id, p]));
        mySchedule = schedule.times.map((t) => {
          const m = schedule.meetings.find((x) => x.round === t.round && (x.a === me.id || x.b === me.id));
          const partner = m ? byId[m.a === me.id ? m.b : m.a] || null : null;
          return { ...t, table: m?.table ?? null, partner };
        });
      }
      return send(res, 200, {
        serverNow: new Date().toISOString(),
        me,
        roster,
        pitched: pitched || [],
        event: { phase, closesAt: ev?.closesAt || null, maxChoices: ev?.maxChoices || 5 },
        prefs: prefs?.list || [],
        prefsAt: prefs?.at || null,
        schedule: mySchedule,
        publishedAt: phase === 'published' ? schedule?.publishedAt || null : null,
      });
    }

    if (req.method === 'POST') {
      const b = readBody(req);
      const who = await identify(b.t);
      if (!who) return send(res, 404, { error: 'הקישור לא תקין' });
      const ev = await store.get(K.event);
      if (effectivePhase(ev) !== 'open') return send(res, 409, { error: 'הגשת ההעדפות סגורה' });
      const valid = new Set(who.roster.map((p) => p.id));
      const max = ev?.maxChoices || 5;
      const list = [...new Set((Array.isArray(b.list) ? b.list : []).map(String))]
        .filter((id) => valid.has(id) && id !== who.me.id)
        .slice(0, max);
      const at = new Date().toISOString();
      await store.set(K.prefs(who.me.id), { list, at });
      return send(res, 200, { list, at });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return send(res, 500, { error: String(e?.message || e) });
  }
}
