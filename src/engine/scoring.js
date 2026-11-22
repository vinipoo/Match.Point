// Stage A — hard filtering + pair scoring (0-100)
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const norm = (s) => String(s ?? '').trim().toLowerCase();

export const BLOCK_REASONS = {
  exclude: 'זוג מוחרג ידנית',
  venture: 'שני מיזמים קיימים – אף צד לא מוכן להצטרף',
  sameSide: 'אותו צד (התאמות בתוך הצד כבויות)',
};

// how well `have` covers what `want` asks for (0..1). Neutral 0.5 if nothing asked.
const coverage = (want = [], have = []) => {
  if (!want.length) return 0.5;
  const H = new Set(have.map(norm));
  const hits = want.filter((w) => H.has(norm(w))).length;
  return Math.min(1, hits / Math.min(want.length, 2));
};

const sideFit = (a, b) => {
  if (a === b) return a === 'both' ? 0.6 : 0.25;
  if (a === 'both' || b === 'both') return 0.8;
  return 1; // tech <-> business
};

// venture direction matrix: own / join / new / flex
const VM = {
  own: { own: 0.2, join: 1, new: 0.45, flex: 0.8 },
  join: { own: 1, join: 0.25, new: 0.5, flex: 0.7 },
  new: { own: 0.45, join: 0.5, new: 1, flex: 0.9 },
  flex: { own: 0.8, join: 0.7, new: 0.9, flex: 0.8 },
};
const AV = { full: 3, part: 2, evenings: 1 };
const rankFactor = (r) => (r == null || r === 0 ? 1 : 1 - (Math.min(5, Math.max(1, r)) - 1) * 0.1);

export function hardFilter(a, b, settings, excludeSet) {
  if (excludeSet.has(pairKey(a.id, b.id))) return 'exclude';
  if (
    settings.enforceVentureRule &&
    a.ventureMode === 'own' && b.ventureMode === 'own' &&
    !a.openToJoin && !b.openToJoin
  ) return 'venture';
  if (!settings.allowSameSide && a.side === b.side && a.side !== 'both') return 'sameSide';
  return null;
}

export function scorePair(a, b, weights) {
  const pa = (a.prefs || []).find((p) => p.id === b.id);
  const pb = (b.prefs || []).find((p) => p.id === a.id);
  let prefs = 0;
  let prefKind = 'none';
  if (pa && pb) {
    prefs = 0.85 + 0.15 * ((rankFactor(pa.rank) + rankFactor(pb.rank)) / 2);
    prefKind = 'mutual';
  } else if (pa || pb) {
    prefs = 0.6 * rankFactor((pa || pb).rank);
    prefKind = pa ? 'a' : 'b';
  }

  const side = sideFit(a.side, b.side);
  const skill = (coverage(a.seekSkills, b.skills) + coverage(b.seekSkills, a.skills)) / 2;
  const role = 0.55 * side + 0.45 * skill;

  let venture = VM[a.ventureMode || 'flex']?.[b.ventureMode || 'flex'] ?? 0.6;
  const owner = a.ventureMode === 'own' ? a : b.ventureMode === 'own' ? b : null;
  if (owner) {
    const other = owner === a ? b : a;
    if (owner.stage === 'growth' && other.availability === 'evenings') venture *= 0.7;
    if (owner.stage === 'idea' && other.ventureMode === 'join') venture *= 0.85;
  }

  const availability = 1 - Math.abs((AV[a.availability] || 2) - (AV[b.availability] || 2)) / 2;

  const ia = (a.industry || []).map(norm);
  const ib = new Set((b.industry || []).map(norm));
  const inter = ia.filter((x) => ib.has(x)).length;
  const uni = new Set([...ia, ...ib]).size || 1;
  const industry = inter ? 0.6 + (0.4 * inter) / uni : 0;

  const comps = { prefs, role, venture, availability, industry };
  const wsum = Object.values(weights).reduce((s, v) => s + Number(v || 0), 0) || 1;
  const raw = Object.entries(comps).reduce((s, [k, v]) => s + Number(weights[k] || 0) * v, 0);
  return { score: Math.round((raw / wsum) * 100), comps, prefKind, skill, sides: [a.side, b.side] };
}

export function computeScores(participants, weights, settings, constraints) {
  const ex = new Set((constraints.exclude || []).map(([x, y]) => pairKey(x, y)));
  const map = new Map();
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      const s = scorePair(a, b, weights);
      map.set(pairKey(a.id, b.id), { ...s, blocked: hardFilter(a, b, settings, ex) });
    }
  }
  return map;
}

export const getScore = (scores, a, b) => scores.get(pairKey(a, b));

function complementLabel([sa, sb], skill) {
  const set = new Set([sa, sb]);
  if (set.has('tech') && set.has('business')) return 'השלמת Tech↔Biz';
  if (set.has('both') && set.size === 2) return 'השלמה היברידית';
  return skill >= 0.5 ? 'כישורים משלימים' : 'אותו צד';
}

// Explainability tag for a scheduled meeting
export function explain(m, scores) {
  const e = scores.get(pairKey(m.a, m.b));
  const score = e?.score ?? m.score ?? 0;
  if (m.source === 'must') return { label: 'Must-match נעול', score, kind: 'lock' };
  if (m.source === 'manual') return { label: 'שיבוץ ידני', score, kind: 'lock' };
  if (m.source === 'wildcard') return { label: 'Wildcard // היכרות מפתיעה', score, kind: 'wild' };
  const parts = [];
  let kind = 'std';
  if (e?.prefKind === 'mutual') { parts.push('הדדי'); kind = 'mutual'; }
  else if (e?.prefKind === 'a' || e?.prefKind === 'b') { parts.push('בחירה'); kind = 'pick'; }
  const c = e?.comps || {};
  if (kind !== 'mutual' && e) {
    if (c.role >= 0.7) parts.push(complementLabel(e.sides, e.skill));
    else if (c.venture >= 0.9) parts.push('כיוון מיזם');
    else if (c.industry > 0) parts.push('תחום משותף');
    if (kind === 'std' && parts.length < 2) {
      if (c.venture >= 0.9 && !parts.includes('כיוון מיזם')) parts.push('כיוון מיזם');
      else if (c.industry > 0 && !parts.includes('תחום משותף')) parts.push('תחום משותף');
    }
  }
  if (m.source === 'fallback') { parts.unshift(e?.blocked === 'sameSide' ? 'השלמה לפי פרופיל (אותו צד)' : 'השלמה לפי פרופיל'); kind = 'fair'; }
  if (!parts.length) parts.push('התאמה כללית');
  return { label: parts.join(' + '), score, kind };
}
