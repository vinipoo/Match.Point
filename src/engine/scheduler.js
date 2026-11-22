// Stage B — multi-round scheduling: fairness first, then quality, then fill.
// Per round: weighted greedy matching (fairness + scarcity boosted) followed by
// local search (2-swap exchanges + augmenting replacements).
import { pairKey } from './scoring';

export function roundStartMinutes(settings, r) {
  const [h, m] = String(settings.startTime || '18:45').split(':').map(Number);
  return h * 60 + m + (r - 1) * (Number(settings.roundMin) + Number(settings.transitionMin));
}
export const fmtTime = (mins) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
export const roundTime = (s, r) => fmtTime(roundStartMinutes(s, r));
export const roundEnd = (s, r) => fmtTime(roundStartMinutes(s, r) + Number(s.roundMin));

export function activeIds(participants, settings) {
  return participants
    .filter(
      (p) =>
        p.status === 'checked_in' ||
        (!settings.liveMode && (p.status === 'confirmed' || (settings.includePending && p.status === 'pending'))),
    )
    .map((p) => p.id);
}

// small seeded PRNG so a Wildcard draw is random but reproducible (same seed -> same pairs)
function rng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function schedule({ participants, scores, settings, constraints, existing = [], mode = 'fresh' }) {
  const R = Number(settings.rounds);
  const T = Number(settings.tables);
  const thr = Number(settings.threshold);
  const minM = Number(settings.minMeetings);
  const active = new Set(activeIds(participants, settings));
  const ids = [...active];
  const startRound = mode === 'preserve' ? Math.max(1, Math.min(R, Number(settings.currentRound) || 1)) : 1;

  const meetings = [];
  const busy = Array.from({ length: R + 2 }, () => new Set());
  const used = Array.from({ length: R + 2 }, () => new Set());
  const seat = Array.from({ length: R + 2 }, () => ({})); // round -> id -> table
  const met = new Set();
  const count = Object.fromEntries(ids.map((id) => [id, 0]));
  const log = { mode, kept: 0, dropped: 0, must: 0, auto: 0, fallback: 0, unplacedMust: [] };

  const freeTable = (r, prefer = []) => {
    for (const t of prefer) if (t && t <= T && !used[r].has(t)) return t;
    for (let t = 1; t <= T; t++) if (!used[r].has(t)) return t;
    return null;
  };
  const place = (m) => {
    meetings.push(m);
    busy[m.round].add(m.a); busy[m.round].add(m.b);
    used[m.round].add(m.table);
    seat[m.round][m.a] = m.table; seat[m.round][m.b] = m.table;
    met.add(pairKey(m.a, m.b));
    count[m.a] = (count[m.a] || 0) + 1;
    count[m.b] = (count[m.b] || 0) + 1;
  };

  // 1 — keep existing meetings (locked always; in preserve-mode every valid one)
  const sortedExisting = [...existing].sort((x, y) => (y.locked ? 1 : 0) - (x.locked ? 1 : 0) || x.round - y.round);
  for (const m of sortedExisting) {
    const bothActive = active.has(m.a) && active.has(m.b);
    const keep = m.round <= R && bothActive && (mode === 'preserve' || m.locked);
    if (!keep || busy[m.round].has(m.a) || busy[m.round].has(m.b) || met.has(pairKey(m.a, m.b))) {
      log.dropped++;
      continue;
    }
    const table = m.table <= T && !used[m.round].has(m.table) ? m.table : freeTable(m.round);
    if (!table) { log.dropped++; continue; }
    place({ ...m, table });
    log.kept++;
  }

  // 2 — must-match pairs (override filters)
  for (const [x, y] of constraints.must || []) {
    if (!active.has(x) || !active.has(y)) { log.unplacedMust.push([x, y, 'משתתף לא פעיל']); continue; }
    if (met.has(pairKey(x, y))) continue;
    let done = false;
    for (let r = startRound; r <= R && !done; r++) {
      if (busy[r].has(x) || busy[r].has(y)) continue;
      const t = freeTable(r, [seat[r - 1]?.[x], seat[r - 1]?.[y]]);
      if (!t) continue;
      place({ id: newId(), round: r, table: t, a: x, b: y, score: scores.get(pairKey(x, y))?.score ?? 0, locked: true, source: 'must' });
      log.must++;
      done = true;
    }
    if (!done) log.unplacedMust.push([x, y, 'אין סבב פנוי לשניהם']);
  }

  // 3 — round-by-round optimisation
  const eligible = (x, y, floor) => {
    const k = pairKey(x, y);
    const e = scores.get(k);
    if (!e || e.blocked || met.has(k) || e.score < floor) return null;
    return e;
  };

  const matchRound = (r, floor, filterFn, source) => {
    const cap = T - used[r].size;
    if (cap <= 0) return;
    const free = ids.filter((id) => !busy[r].has(id));
    const remaining = R - r + 1;
    // scarcity: how many quality partners are still available to each person overall
    const opts = {};
    for (const x of free) opts[x] = ids.reduce((n, o) => n + (o !== x && eligible(x, o, thr) ? 1 : 0), 0);
    const fair = (id) => {
      const c = count[id] || 0;
      if (c < minM) return 18 * (minM - c) * (remaining <= minM - c + 1 ? 2 : 1);
      return -2 * (c - minM); // gently spread popular people
    };
    const W = new Map();
    const edges = [];
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const x = free[i];
        const y = free[j];
        const e = eligible(x, y, floor);
        if (!e || (filterFn && !filterFn(x, y))) continue;
        const w = e.score + (e.prefKind === 'mutual' ? 12 : 0) + fair(x) + fair(y) + 10 / Math.max(1, opts[x]) + 10 / Math.max(1, opts[y]);
        const ed = { x, y, e, w };
        edges.push(ed);
        W.set(pairKey(x, y), ed);
      }
    }
    edges.sort((p, q) => q.w - p.w);

    let chosen = [];
    const taken = new Set();
    for (const ed of edges) {
      if (chosen.length >= cap) break;
      if (taken.has(ed.x) || taken.has(ed.y)) continue;
      taken.add(ed.x); taken.add(ed.y);
      chosen.push(ed);
    }

    // local search
    for (let iter = 0; iter < 60; iter++) {
      let improved = false;
      // a) 2-swap exchange between two chosen meetings
      outer: for (let i = 0; i < chosen.length; i++) {
        for (let j = i + 1; j < chosen.length; j++) {
          const A = chosen[i];
          const B = chosen[j];
          const cur = A.w + B.w;
          for (const [p, q] of [[[A.x, B.x], [A.y, B.y]], [[A.x, B.y], [A.y, B.x]]]) {
            const e1 = W.get(pairKey(...p));
            const e2 = W.get(pairKey(...q));
            if (e1 && e2 && e1.w + e2.w > cur + 0.01) {
              chosen[i] = e1; chosen[j] = e2;
              improved = true;
              break outer;
            }
          }
        }
      }
      // b) augmenting: (a,b) + idle u,v  ->  (a,u) + (b,v)  — one more meeting
      if (!improved && chosen.length < cap) {
        const inUse = new Set(chosen.flatMap((c) => [c.x, c.y]));
        const idle = free.filter((id) => !inUse.has(id));
        outer2: for (let i = 0; i < chosen.length; i++) {
          const A = chosen[i];
          for (const u of idle) {
            const e1 = W.get(pairKey(A.x, u));
            if (!e1) continue;
            for (const v of idle) {
              if (u === v) continue;
              const e2 = W.get(pairKey(A.y, v));
              if (e2) { chosen.splice(i, 1, e1, e2); improved = true; break outer2; }
            }
          }
        }
      }
      if (!improved) break;
    }

    // seat assignment: keep someone at their previous table when possible
    chosen.sort((p, q) => q.e.score - p.e.score);
    for (const ed of chosen) {
      const t = freeTable(r, [seat[r - 1]?.[ed.x], seat[r - 1]?.[ed.y]]);
      if (!t) break;
      place({ id: newId(), round: r, table: t, a: ed.x, b: ed.y, score: ed.e.score, locked: false, source });
      log[source]++;
    }
  };

  // Wildcard round: controlled-random complementary pairs (Tech ↔ Business), ignoring explicit picks
  const wild = settings.wildcardEnabled ? Number(settings.wildcardRound) : null;
  const isWild = (r) => wild !== null && r === wild;
  log.wildcard = 0;

  for (let r = startRound; r <= R; r++) if (!isWild(r)) matchRound(r, thr, null, 'auto');

  // 4 — fairness fallback: lower the bar only for under-served people
  if (settings.fairnessFallback) {
    const floor = thr - Number(settings.fallbackDrop || 0);
    for (let r = startRound; r <= R; r++) {
      if (isWild(r)) continue;
      matchRound(r, floor, (x, y) => (count[x] || 0) < minM || (count[y] || 0) < minM, 'fallback');
    }
  }

  if (wild !== null && wild >= startRound && wild <= R) {
    const r = wild;
    const rand = rng(settings.wildcardSeed);
    const free = ids.filter((id) => !busy[r].has(id));
    const sideOf = Object.fromEntries(participants.map((p) => [p.id, p.side]));
    const ok = (x, y) => {
      const e = scores.get(pairKey(x, y));
      // hard rules still apply (exclusions / venture rule), explicit preferences do not
      return e && (!e.blocked || e.blocked === 'sameSide') && !met.has(pairKey(x, y));
    };
    const tech = shuffle(free.filter((id) => sideOf[id] === 'tech'), rand);
    const biz = shuffle(free.filter((id) => sideOf[id] === 'business'), rand);
    const both = shuffle(free.filter((id) => sideOf[id] === 'both'), rand);
    // smaller group first so as many people as possible get a surprise partner
    const [few, many] = tech.length <= biz.length ? [tech, biz] : [biz, tech];
    const pool = [...many, ...both];
    const taken = new Set();
    const pairs = [];
    for (const x of [...few, ...both]) {
      if (taken.has(x)) continue;
      const y = pool.find((cand) => cand !== x && !taken.has(cand) && sideOf[cand] !== sideOf[x] && ok(x, cand));
      if (!y) continue;
      taken.add(x); taken.add(y);
      pairs.push([x, y]);
    }
    for (const [x, y] of pairs) {
      const t = freeTable(r, [seat[r - 1]?.[x], seat[r - 1]?.[y]]);
      if (!t) break;
      place({ id: newId(), round: r, table: t, a: x, b: y, score: scores.get(pairKey(x, y))?.score ?? 0, locked: false, source: 'wildcard' });
      log.wildcard++;
    }
  }

  meetings.sort((x, y) => x.round - y.round || x.table - y.table);
  return { meetings, log };
}

export function scheduleStats(meetings, active, settings, scores) {
  const count = Object.fromEntries(active.map((id) => [id, 0]));
  let sum = 0;
  let mutualMet = 0;
  for (const m of meetings) {
    count[m.a] = (count[m.a] || 0) + 1;
    count[m.b] = (count[m.b] || 0) + 1;
    const e = scores.get(pairKey(m.a, m.b));
    sum += e?.score ?? m.score ?? 0;
    if (e?.prefKind === 'mutual') mutualMet++;
  }
  let mutualTotal = 0;
  const act = new Set(active);
  for (const [k, e] of scores) {
    const [a, b] = k.split('|');
    if (e.prefKind === 'mutual' && act.has(a) && act.has(b) && !e.blocked) mutualTotal++;
  }
  const vals = active.map((id) => count[id] || 0);
  return {
    count,
    total: meetings.length,
    avg: meetings.length ? Math.round(sum / meetings.length) : 0,
    mutualMet,
    mutualTotal,
    zero: active.filter((id) => !count[id]),
    under: active.filter((id) => (count[id] || 0) < settings.minMeetings),
    max: vals.length ? Math.max(...vals) : 0,
    min: vals.length ? Math.min(...vals) : 0,
  };
}

export function analyzeGaps(participants, active, scores, settings) {
  const act = participants.filter((p) => active.includes(p.id));
  const counts = { tech: 0, business: 0, both: 0 };
  act.forEach((p) => { counts[p.side] = (counts[p.side] || 0) + 1; });
  const thr = Number(settings.threshold);
  const options = {};
  const rescue = {};
  for (const p of act) {
    let o = 0;
    let r = 0;
    for (const q of act) {
      if (q.id === p.id) continue;
      const e = scores.get(pairKey(p.id, q.id));
      if (!e) continue;
      if (!e.blocked && e.score >= thr) o++;
      else if (e.blocked === 'sameSide' && e.score >= thr) r++;
    }
    options[p.id] = o;
    rescue[p.id] = r;
  }
  const weak = act
    .filter((p) => options[p.id] < settings.minMeetings)
    .map((p) => ({ p, opts: options[p.id], rescue: rescue[p.id] }))
    .sort((x, y) => x.opts - y.opts);
  const techSide = counts.tech + counts.both / 2;
  const bizSide = counts.business + counts.both / 2;
  const maxPerRound = Math.min(Number(settings.tables), Math.floor(act.length / 2));
  return {
    counts,
    total: act.length,
    techSide,
    bizSide,
    ratio: bizSide ? techSide / bizSide : 0,
    imbalance: Math.abs(counts.tech - counts.business),
    weak,
    options,
    rescueCount: weak.filter((w) => w.rescue > 0).length,
    tablesShort: Number(settings.tables) * 2 < act.length,
    maxPerRound,
  };
}
