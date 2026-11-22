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

// Only participants marked as arrived (checked-in) are scheduled.
// eslint-disable-next-line no-unused-vars
export function activeIds(participants, settings) {
  return participants.filter((p) => p.status === 'checked_in').map((p) => p.id);
}

// a meeting is a pair, or a trio (c) when the number of people present is odd
export const members = (m) => [m.a, m.b, m.c].filter(Boolean);
export const partnersOf = (m, id) => members(m).filter((x) => x !== id);

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
  const active = new Set(activeIds(participants, settings));
  const ids = [...active];
  const startRound = mode === 'preserve' ? Math.max(1, Math.min(R, Number(settings.currentRound) || 1)) : 1;

  const meetings = [];
  const busy = Array.from({ length: R + 2 }, () => new Set());
  const used = Array.from({ length: R + 2 }, () => new Set());
  const seat = Array.from({ length: R + 2 }, () => ({})); // round -> id -> table
  const met = new Set();
  const count = Object.fromEntries(ids.map((id) => [id, 0]));
  const log = { mode, kept: 0, dropped: 0, must: 0, auto: 0, fallback: 0, wildcard: 0, unplacedMust: [] };

  const freeTable = (r, prefer = []) => {
    for (const t of prefer) if (t && t <= T && !used[r].has(t)) return t;
    for (let t = 1; t <= T; t++) if (!used[r].has(t)) return t;
    return null;
  };
  const place = (m) => {
    meetings.push(m);
    used[m.round].add(m.table);
    const ms = members(m);
    for (const id of ms) {
      busy[m.round].add(id);
      seat[m.round][id] = m.table;
      count[id] = (count[id] || 0) + 1;
    }
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) met.add(pairKey(ms[i], ms[j]));
  };

  // 1 — keep existing meetings (locked always; in preserve-mode every valid one)
  const sortedExisting = [...existing].sort((x, y) => (y.locked ? 1 : 0) - (x.locked ? 1 : 0) || x.round - y.round);
  for (const raw of sortedExisting) {
    // a trio member who left (or is double-booked) is simply removed from the table
    const m = raw.c && (!active.has(raw.c) || busy[raw.round]?.has(raw.c)) ? { ...raw, c: undefined } : raw;
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
  //   Rounds 1..K ("minimum block", K = minMeetings, default 3): try to seat EVERY free person each
  //   round, so everyone gets K consecutive meetings at the start of the evening. Good matches
  //   (above the threshold, mutual picks first) win; anyone left without one is completed with the
  //   highest-scoring candidate by profile/form (role, skills, stage, availability, domain) –
  //   never a random draw. Same-side pairs are used only when no cross-side partner is free.
  //   Rounds K+1..R: only good matches; people still below K are topped up first; everyone else
  //   who has no suitable partner gets free networking (extra meetings already earned are kept).
  const K = Math.max(1, Math.min(R, Number(settings.minMeetings) || 3));
  const allowSameSideFill = settings.fairnessFallback !== false;

  const quality = (x, y) => {
    const k = pairKey(x, y);
    const e = scores.get(k);
    return e && !e.blocked && !met.has(k) && e.score >= thr ? e : null;
  };
  // returns [entry, penalty] – in the first K rounds only explicit exclusions are hard, so nobody is left out
  const profileFill = (x, y, inBlock) => {
    const k = pairKey(x, y);
    const e = scores.get(k);
    if (!e || met.has(k) || e.blocked === 'exclude') return null;
    if (!e.blocked) return [e, 0];
    if (e.blocked === 'sameSide') return inBlock || allowSameSideFill ? [e, 0] : null;
    return inBlock ? [e, 60] : null; // venture-vs-venture: last resort, only to guarantee the minimum
  };
  // priority picks: rank 1 > 2 > … > 5, mutual picks with high ranks on both sides first
  const prefBonus = (e) => {
    if (e.prefKind === 'mutual') return 10 + 20 * ((e.rfA + e.rfB) / 2);
    if (e.prefKind === 'a' || e.prefKind === 'b') return 8 * (e.prefKind === 'a' ? e.rfA : e.rfB);
    return 0;
  };

  const matchRound = (r) => {
    const cap = T - used[r].size;
    if (cap <= 0) return;
    const free = ids.filter((id) => !busy[r].has(id));
    if (free.length < 2) return;
    const inBlock = r <= K;
    const remaining = R - r + 1;
    const below = (id) => (count[id] || 0) < K;
    const opts = {};
    for (const x of free) opts[x] = ids.reduce((n, o) => n + (o !== x && quality(x, o) ? 1 : 0), 0);
    const fair = (id) => {
      const d = K - (count[id] || 0);
      if (d > 0) return 25 * d * (remaining <= d ? 2 : 1); // running out of rounds -> urgent
      return -2 * (-d); // gently spread popular people
    };

    const W = new Map();
    const edges = [];
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const x = free[i];
        const y = free[j];
        let e = quality(x, y);
        let tier = 'auto';
        let penalty = 0;
        if (!e && (inBlock || below(x) || below(y))) {
          const f = profileFill(x, y, inBlock || below(x) || below(y));
          if (f) [e, penalty] = f;
          tier = 'fallback';
        }
        if (!e) continue;
        const w = e.score + (tier === 'auto' ? 40 : 0) + prefBonus(e) - penalty
          + fair(x) + fair(y) + 10 / Math.max(1, opts[x]) + 10 / Math.max(1, opts[y]);
        const ed = { x, y, e, w, tier };
        edges.push(ed);
        W.set(pairKey(x, y), ed);
      }
    }
    edges.sort((p, q) => q.w - p.w);

    const chosen = [];
    const taken = new Set();
    for (const ed of edges) {
      if (chosen.length >= cap) break;
      if (taken.has(ed.x) || taken.has(ed.y)) continue;
      taken.add(ed.x); taken.add(ed.y);
      chosen.push(ed);
    }

    // local search: better pairings (2-swap) and more people seated (augmenting replacements)
    for (let iter = 0; iter < 120; iter++) {
      let improved = false;
      // a) seat more people first: (a,b) + idle u,v -> (a,u) + (b,v)
      if (chosen.length < cap) {
        const inUse = new Set(chosen.flatMap((c) => [c.x, c.y]));
        const idle = free.filter((id) => !inUse.has(id));
        // direct pair between two idle people
        outer0: for (let i = 0; i < idle.length; i++) {
          for (let j = i + 1; j < idle.length; j++) {
            const e = W.get(pairKey(idle[i], idle[j]));
            if (e) { chosen.push(e); improved = true; break outer0; }
          }
        }
        if (!improved) {
          outer1: for (let i = 0; i < chosen.length; i++) {
            const A = chosen[i];
            for (const [p, q] of [[A.x, A.y], [A.y, A.x]]) {
              for (const u of idle) {
                const e1 = W.get(pairKey(p, u));
                if (!e1) continue;
                for (const v of idle) {
                  if (u === v) continue;
                  const e2 = W.get(pairKey(q, v));
                  if (e2) { chosen.splice(i, 1, e1, e2); improved = true; break outer1; }
                }
              }
            }
          }
        }
      }
      // b) 2-swap exchange between two chosen meetings for a higher total
      if (!improved) {
        outer2: for (let i = 0; i < chosen.length; i++) {
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
                break outer2;
              }
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
      place({ id: newId(), round: r, table: t, a: ed.x, b: ed.y, score: ed.e.score, locked: false, source: ed.tier });
      log[ed.tier]++;
    }
  };

  // Wildcard round: controlled-random complementary pairs (Tech ↔ Business), ignoring explicit picks
  const wild = settings.wildcardEnabled ? Number(settings.wildcardRound) : null;
  log.wildcard = 0;
  const wildcardRound = (r) => {
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
    const [few, many] = tech.length <= biz.length ? [tech, biz] : [biz, tech];
    const pool = [...many, ...both];
    const taken = new Set();
    for (const x of [...few, ...both]) {
      if (taken.has(x)) continue;
      const y = pool.find((cand) => cand !== x && !taken.has(cand) && sideOf[cand] !== sideOf[x] && ok(x, cand));
      if (!y) continue;
      const t = freeTable(r, [seat[r - 1]?.[x], seat[r - 1]?.[y]]);
      if (!t) break;
      taken.add(x); taken.add(y);
      place({ id: newId(), round: r, table: t, a: x, b: y, score: scores.get(pairKey(x, y))?.score ?? 0, locked: false, source: 'wildcard' });
      log.wildcard++;
    }
  };

  log.trios = 0;
  log.unseated = [];
  const seatLeftovers = (r) => {
    const left = ids.filter((id) => !busy[r].has(id));
    if (left.length === 1) {
      const u = left[0];
      let best = null;
      for (const m of meetings) {
        if (m.round !== r || m.c) continue;
        const ea = scores.get(pairKey(u, m.a));
        const eb = scores.get(pairKey(u, m.b));
        if (!ea || !eb || ea.blocked === 'exclude' || eb.blocked === 'exclude') continue;
        if (met.has(pairKey(u, m.a)) || met.has(pairKey(u, m.b))) continue;
        const s = ea.score + eb.score;
        if (!best || s > best.s) best = { m, s };
      }
      if (best) {
        best.m.c = u;
        busy[r].add(u);
        seat[r][u] = best.m.table;
        count[u] = (count[u] || 0) + 1;
        met.add(pairKey(u, best.m.a)); met.add(pairKey(u, best.m.b));
        log.trios++;
        return;
      }
    }
    if (left.length) log.unseated.push({ round: r, ids: left });
  };

  for (let r = startRound; r <= R; r++) {
    if (wild === r) wildcardRound(r); // surprise pairs first; anyone left over is completed by score below
    matchRound(r);
    if (r <= K) seatLeftovers(r); // first K rounds: nobody sits out
  }

  meetings.sort((x, y) => x.round - y.round || x.table - y.table);
  return { meetings, log };
}

export function scheduleStats(meetings, active, settings, scores) {
  const count = Object.fromEntries(active.map((id) => [id, 0]));
  let sum = 0;
  let mutualMet = 0;
  for (const m of meetings) {
    for (const id of members(m)) count[id] = (count[id] || 0) + 1;
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
    // the first K rounds should all be meetings ("minimum block")
    earlyGap: (() => {
      const K = Math.min(Number(settings.minMeetings) || 3, Number(settings.rounds));
      const early = {};
      for (const m of meetings) if (m.round <= K) for (const id of members(m)) early[id] = (early[id] || 0) + 1;
      return active.filter((id) => (early[id] || 0) < K);
    })(),
    sameSideFill: meetings.filter((m) => m.source === 'fallback' && scores.get(pairKey(m.a, m.b))?.blocked === 'sameSide').length,
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
    tablesNeeded: Math.floor(act.length / 2), // odd count -> one three-person table
    maxPerRound,
  };
}
