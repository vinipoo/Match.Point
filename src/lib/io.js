// Import (CSV / Excel via SheetJS) + exports (XLSX / CSV / WhatsApp text)
import * as XLSX from 'xlsx';
import { pairKey } from '../engine/scoring';
import { roundTime } from '../engine/scheduler';
import { EVENT, SIDES, STATUSES, AVAIL, VENTURE, STAGES } from './constants';

const norm = (s) => String(s ?? '').trim().toLowerCase();
const splitList = (v) => String(v ?? '').split(/[;,|\n]/).map((s) => s.trim()).filter(Boolean);
const joinList = (a) => (a || []).join('; ');

const ALIASES = {
  id: ['id', 'מזהה', 'מס׳', 'מספר'],
  name: ['name', 'full name', 'שם', 'שם מלא'],
  firstName: ['first name', 'first_name', 'שם פרטי'],
  lastName: ['last name', 'last_name', 'שם משפחה'],
  email: ['email', 'e-mail', 'mail', 'אימייל', 'מייל', 'דוא"ל', 'כתובת מייל', 'כתובת אימייל'],
  phone: ['phone', 'mobile', 'טלפון', 'נייד', 'מספר טלפון'],
  side: ['side', 'צד', 'צד באירוע', 'תפקיד'],
  idea: ['idea', 'רעיון', 'מיזם'],
  status: ['status', 'rsvp', 'סטטוס', 'סטטוס הגעה'],
  brings: ['brings', 'what i bring', 'מה מביא', 'מה מביא/ה לשולחן', 'מה הוא מביא לשולחן'],
  seeking: ['seeking', 'looking for', 'מחפש', 'מחפש/ת', 'איזה שותף מחפש'],
  skills: ['skills', 'כישורים'],
  seekSkills: ['seek_skills', 'seeking_skills', 'wanted skills', 'כישורים מבוקשים'],
  industry: ['industry', 'domain', 'תחום', 'תחום עיסוק', 'תעשייה'],
  stage: ['stage', 'שלב', 'שלב המיזם'],
  ventureMode: ['venture_mode', 'venture', 'כיוון מיזם', 'כיוון'],
  openToJoin: ['open_to_join', 'פתוח להצטרף', 'פתוח/ה להצטרף'],
  availability: ['availability', 'commitment', 'זמינות', 'היקף משרה'],
  prefs: ['preferences', 'prefs', 'want_to_meet', 'העדפות', 'רוצה לפגוש'],
  must: ['must_match', 'must', 'פגישות נעולות', 'נעול'],
  exclude: ['exclude', 'החרגה', 'לא לשבץ עם'],
};

// Long Google-Form questions, matched by prefix (duplicate headers arrive as "…_1")
const PREFIX_ALIASES = [
  ['side', 'מה מתאר את הצד שלך'],
  ['idea', 'אם יש לך מיזם או רעיון'],
  ['experience', 'מה כבר עשית בפועל'],
  ['industry', 'מה הדומיין'],
  ['industryNote', 'פרט/י'],
];

// Experience answers from the registration form -> skill tag + venture stage
const EXPERIENCE = [
  ['יש לי רעיון', 'רעיון בשלב מוקדם', 'idea'],
  ['דיברתי עם לקוחות', 'ולידציה מול לקוחות', 'idea'],
  ['נכונות לשלם', 'לקוחות משלמים', 'mvp'],
  ['בניתי והובלתי פעילות עסקית', 'הובלה עסקית', 'mvp'],
  ['הובלתי פיתוח', 'הובלת צוות פיתוח', 'none'],
  ['בניתי מוצר או mvp', 'בניית MVP', 'mvp'],
  ['בניתי פרויקטים עצמאיים', 'פרויקטים עצמאיים', 'none'],
  ['לומד/ת פיתוח', 'בלימודי פיתוח', 'none'],
];
const SIDE_SKILL = { tech: 'פיתוח', business: 'עסקי' };

// "טופס 1: …\n\nטופס 2: …" (someone submitted the form more than once)
const formParts = (v) => String(v ?? '').split(/טופס\s*\d+\s*:/).map((s) => s.trim()).filter(Boolean);
const lastFormAnswer = (v) => { const p = formParts(v); return p.length ? p[p.length - 1] : ''; };
const uniq = (a) => [...new Set(a)];

const normPhone = (v) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (/^972\d{8,9}$/.test(d)) return `0${d.slice(3, 5)}-${d.slice(5)}`;
  return String(v ?? '').trim();
};

const VALUES = {
  side: { tech: 'tech', technical: 'tech', 'טכנולוגי': 'tech', 'טכני': 'tech', business: 'business', biz: 'business', 'עסקי': 'business', both: 'both', hybrid: 'both', 'היברידי': 'both' },
  status: { confirmed: 'confirmed', 'מאושר': 'confirmed', 'checked-in': 'checked_in', checked_in: 'checked_in', checkedin: 'checked_in', 'הגיע': 'checked_in', 'הגיע בפועל': 'checked_in', 'no-show': 'no_show', no_show: 'no_show', noshow: 'no_show', 'לא הגיע': 'no_show', pending: 'pending', 'בהמתנה': 'pending', waitlist: 'pending' },
  stage: { none: 'none', 'ללא': 'none', 'ללא מיזם': 'none', idea: 'idea', 'רעיון': 'idea', mvp: 'mvp', growth: 'growth', 'צמיחה': 'growth' },
  ventureMode: { own: 'own', 'יש מיזם': 'own', join: 'join', 'הצטרפות': 'join', 'הצטרפות למיזם קיים': 'join', new: 'new', 'חדש': 'new', 'הקמה מאפס': 'new', flex: 'flex', 'גמיש': 'flex' },
  availability: { full: 'full', 'מלאה': 'full', 'משרה מלאה': 'full', part: 'part', 'חלקית': 'part', 'משרה חלקית': 'part', evenings: 'evenings', 'ערבים': 'evenings', side: 'evenings' },
};
const mapVal = (field, v, def) => {
  const n = norm(v);
  if (VALUES[field][n]) return VALUES[field][n];
  if (field === 'side' && n) {
    if (n.includes('היבריד') || n.includes('both') || (n.includes('טכנו') && n.includes('עסקי'))) return 'both';
    if (n.includes('טכנו') || n.includes('tech') || n.includes('פיתוח')) return 'tech';
    if (n.includes('עסקי') || n.includes('business') || n.includes('שיווק') || n.includes('מכירות') || n.includes('מנכ')) return 'business';
  }
  return def;
};
const truthy = (v) => ['1', 'true', 'yes', 'y', 'כן', 'v', '✓'].includes(norm(v));

export async function readFile(file) {
  let wb;
  if (/\.csv$/i.test(file.name)) wb = XLSX.read(await file.text(), { type: 'string' });
  else wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

export function mapRows(rows) {
  const warnings = [];
  const fieldOf = (h) => {
    const n = norm(h).replace(/_\d+$/, '');
    for (const [f, al] of Object.entries(ALIASES)) if (al.some((a) => norm(a) === n)) return f;
    for (const [f, prefix] of PREFIX_ALIASES) if (n.startsWith(norm(prefix))) return f;
    return null;
  };
  const recs = [];
  const seen = new Set();
  rows.forEach((row, i) => {
    const r = {};
    for (const [h, v] of Object.entries(row)) {
      const f = fieldOf(h);
      // duplicate columns (e.g. the same question for Tech and for Business): keep the filled one
      if (f && (String(v ?? '').trim() || r[f] == null)) r[f] = v;
    }
    if (!String(r.name ?? '').trim()) {
      r.name = [r.firstName, r.lastName].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
    }
    if (!String(r.name ?? '').trim()) {
      if (Object.values(row).some((v) => String(v ?? '').trim())) warnings.push(`שורה ${i + 2}: חסר שם – השורה דולגה`);
      return;
    }
    let id = String(r.id ?? '').trim() || `P${String(i + 1).padStart(2, '0')}`;
    if (seen.has(id)) { warnings.push(`שורה ${i + 2}: מזהה כפול ${id} – הוקצה מזהה חדש`); id = `${id}-${i + 2}`; }
    seen.add(id);
    recs.push({ id, r });
  });
  const ids = new Set(recs.map((x) => x.id));
  const byName = new Map(recs.map((x) => [norm(x.r.name), x.id]));
  const resolve = (tok) => {
    const t = tok.trim();
    if (ids.has(t)) return t;
    if (ids.has(t.toUpperCase())) return t.toUpperCase();
    return byName.get(norm(t)) || null;
  };
  const must = new Map();
  const exclude = new Map();
  const participants = recs.map(({ id, r }) => {
    const prefs = [];
    for (const tok of splitList(r.prefs)) {
      const m = tok.match(/^(.*?)(?:\s*[:=(]\s*(\d)\)?)?$/);
      const pid = resolve(m ? m[1] : tok);
      const rank = m && m[2] ? Number(m[2]) : null;
      if (!pid) warnings.push(`${r.name}: לא נמצא משתתף "${tok}" בהעדפות`);
      else if (pid !== id && !prefs.some((p) => p.id === pid)) prefs.push({ id: pid, rank: rank || null });
    }
    for (const [field, store] of [['must', must], ['exclude', exclude]]) {
      for (const tok of splitList(r[field])) {
        const pid = resolve(tok);
        if (pid && pid !== id) store.set(pairKey(id, pid), [id, pid]);
        else warnings.push(`${r.name}: לא נמצא משתתף "${tok}" ב-${field}`);
      }
    }
    const side = mapVal('side', lastFormAnswer(r.side), 'both');
    // registration-form answers -> profile fields (only fill what the file did not state explicitly)
    const experience = lastFormAnswer(r.experience);
    const exp = EXPERIENCE.find(([k]) => norm(experience).includes(norm(k)));
    const idea = formParts(r.idea).join(' / ');
    let industry = uniq(formParts(r.industry).flatMap(splitList));
    if (industry.includes('אחר')) {
      const note = String(r.industryNote ?? '').trim();
      industry = industry.filter((x) => x !== 'אחר').concat(note ? [note] : []);
    }
    let skills = splitList(r.skills);
    if (!skills.length && (exp || r.experience != null)) skills = [SIDE_SKILL[side], exp?.[1]].filter(Boolean);
    let seekSkills = splitList(r.seekSkills);
    if (!seekSkills.length && r.experience != null) {
      seekSkills = side === 'tech' ? ['עסקי'] : side === 'business' ? ['פיתוח'] : ['פיתוח', 'עסקי'];
    }
    return {
      id,
      name: String(r.name).trim(),
      email: String(r.email ?? '').trim(),
      phone: normPhone(r.phone),
      side,
      status: mapVal('status', r.status, 'confirmed'),
      brings: String(r.brings ?? '').trim() || experience,
      seeking: String(r.seeking ?? '').trim(),
      idea,
      skills,
      seekSkills,
      industry,
      stage: r.stage != null ? mapVal('stage', r.stage, 'none') : exp?.[2] || (idea ? 'idea' : 'none'),
      ventureMode: mapVal('ventureMode', r.ventureMode, 'flex'),
      openToJoin: truthy(r.openToJoin),
      availability: mapVal('availability', r.availability, 'part'),
      prefs,
    };
  });
  return { participants, constraints: { must: [...must.values()], exclude: [...exclude.values()] }, warnings };
}

// ---------- helpers ----------
const bookRTL = (wb) => { wb.Workbook = { Views: [{ RTL: true }] }; return wb; };
const stamp = () => new Date().toISOString().slice(0, 10);

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const downloadCSV = (ws, filename) => downloadBlob('﻿' + XLSX.utils.sheet_to_csv(ws), filename, 'text/csv;charset=utf-8');

export const TEMPLATE_HEADERS = [
  'id', 'name', 'email', 'phone', 'side', 'status', 'brings', 'seeking', 'idea', 'skills', 'seek_skills',
  'industry', 'stage', 'venture_mode', 'open_to_join', 'availability', 'preferences', 'must_match', 'exclude',
];

export function participantRows(participants, constraints = { must: [], exclude: [] }) {
  const pairsOf = (list, id) => list.filter((p) => p.includes(id)).map(([a, b]) => (a === id ? b : a));
  return participants.map((p) => ({
    id: p.id, name: p.name, email: p.email, phone: p.phone, side: p.side, status: p.status,
    brings: p.brings, seeking: p.seeking, idea: p.idea || '', skills: joinList(p.skills), seek_skills: joinList(p.seekSkills),
    industry: joinList(p.industry), stage: p.stage, venture_mode: p.ventureMode, open_to_join: p.openToJoin ? 'yes' : 'no',
    availability: p.availability,
    preferences: (p.prefs || []).map((x) => (x.rank ? `${x.id}:${x.rank}` : x.id)).join('; '),
    must_match: pairsOf(constraints.must, p.id).join('; '),
    exclude: pairsOf(constraints.exclude, p.id).join('; '),
  }));
}

export function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([
    {
      id: 'P01', name: 'ישראל ישראלי', email: 'israel@example.com', phone: '050-0000000', side: 'tech', status: 'confirmed',
      brings: 'Full-Stack, 8 שנות ניסיון', seeking: 'שותף/ה עסקי/ת למכירות', skills: 'Full-Stack; ענן', seek_skills: 'מכירות B2B; גיוס הון',
      industry: 'SaaS; פינטק', stage: 'none', venture_mode: 'new', open_to_join: 'yes', availability: 'full',
      preferences: 'P02:1; P05:2', must_match: '', exclude: '',
    },
  ], { header: TEMPLATE_HEADERS });
  downloadCSV(ws, 'matchpoint-template.csv');
}

export function exportParticipants(participants, constraints) {
  const wb = bookRTL(XLSX.utils.book_new());
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(participantRows(participants, constraints), { header: TEMPLATE_HEADERS }), 'participants');
  XLSX.writeFile(wb, `matchpoint-participants-${stamp()}.xlsx`);
}

// one-line summary of a partner: their venture idea if they have one, else what they bring
export const profileLine = (p) => p.idea || p.brings || '';

export const shortProfile = (p, len = 70) => {
  const t = `${SIDES[p.side]?.en || ''} · ${profileLine(p)}`;
  return t.length > len ? `${t.slice(0, len - 1)}…` : t;
};

export function personalSchedule(p, meetings, byId, settings) {
  return Array.from({ length: Number(settings.rounds) }, (_, i) => {
    const r = i + 1;
    const m = meetings.find((x) => x.round === r && (x.a === p.id || x.b === p.id));
    const partner = m ? byId[m.a === p.id ? m.b : m.a] : null;
    return { round: r, time: roundTime(settings, r), table: m?.table ?? null, partner, meeting: m || null };
  });
}

export function scheduleCell(slot) {
  if (!slot.partner) return 'נטוורקינג חופשי';
  return `שולחן ${slot.table} · ${slot.partner.name} — ${shortProfile(slot.partner)}`;
}

function personalRows(participants, meetings, byId, settings, active) {
  return participants
    .filter((p) => active.includes(p.id))
    .map((p) => {
      const slots = personalSchedule(p, meetings, byId, settings);
      const row = { 'מזהה': p.id, 'שם': p.name, 'טלפון': p.phone, 'אימייל': p.email, 'צד': SIDES[p.side]?.he, 'מס׳ פגישות': slots.filter((s) => s.partner).length };
      slots.forEach((s) => { row[`סבב ${s.round} (${s.time})`] = scheduleCell(s); });
      return row;
    });
}

export function masterRows(meetings, byId, settings, scores, explainFn) {
  return [...meetings]
    .sort((a, b) => a.round - b.round || a.table - b.table)
    .map((m) => {
      const x = explainFn(m, scores);
      return {
        'סבב': m.round, 'שעה': roundTime(settings, m.round), 'שולחן': m.table,
        "משתתף א'": byId[m.a]?.name, "משתתף ב'": byId[m.b]?.name,
        'ציון': x.score, 'סיבת שיבוץ': x.label, 'נעול': m.locked ? 'כן' : '',
      };
    });
}

export function exportSchedules({ format, participants, meetings, byId, settings, active, scores, explainFn }) {
  const personal = XLSX.utils.json_to_sheet(personalRows(participants, meetings, byId, settings, active));
  if (format === 'csv') return downloadCSV(personal, `matchpoint-personal-schedules-${stamp()}.csv`);
  const wb = bookRTL(XLSX.utils.book_new());
  XLSX.utils.book_append_sheet(wb, personal, 'לוזים אישיים');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterRows(meetings, byId, settings, scores, explainFn)), 'Master Matrix');
  const wa = participants.filter((p) => active.includes(p.id)).map((p) => ({ 'שם': p.name, 'טלפון': p.phone, 'הודעה': whatsappText(p, meetings, byId, settings) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wa), 'WhatsApp');
  XLSX.writeFile(wb, `matchpoint-schedules-${stamp()}.xlsx`);
}

export function exportMaster({ meetings, byId, settings, scores, explainFn, format }) {
  const ws = XLSX.utils.json_to_sheet(masterRows(meetings, byId, settings, scores, explainFn));
  if (format === 'csv') return downloadCSV(ws, `matchpoint-master-matrix-${stamp()}.csv`);
  const wb = bookRTL(XLSX.utils.book_new());
  XLSX.utils.book_append_sheet(wb, ws, 'Master Matrix');
  XLSX.writeFile(wb, `matchpoint-master-matrix-${stamp()}.xlsx`);
}

export function whatsappText(p, meetings, byId, settings) {
  const first = p.name.split(' ')[0];
  const slots = personalSchedule(p, meetings, byId, settings);
  const lines = slots.map((s) =>
    s.partner
      ? `▪️ סבב ${s.round} · ${s.time} · שולחן ${s.table} — ${s.partner.name} (${SIDES[s.partner.side]?.he}${profileLine(s.partner) ? ` · ${profileLine(s.partner).slice(0, 60)}${profileLine(s.partner).length > 60 ? '…' : ''}` : ''})`
      : `▫️ סבב ${s.round} · ${s.time} · נטוורקינג חופשי ☕`,
  );
  return [
    `היי ${first}! 👋`,
    `הנה הלו"ז האישי שלך ל-${EVENT.brand} – ${EVENT.titleHe} ${EVENT.titleEn}`,
    `📍 ${EVENT.venueHe} / ${EVENT.venueEn}, ${EVENT.address}`,
    `🗓️ ${EVENT.date} · התכנסות ${settings.doorsTime} · סבב ראשון ${roundTime(settings, 1)}`,
    '',
    ...lines,
    '',
    `כל סבב ${settings.roundMin} דקות + ${settings.transitionMin} דקות מעבר. מומלץ להגיע עם Pitch של דקה 🎯`,
    'נתראה! צוות הרציף',
  ].join('\n');
}

export const waLink = (phone, text) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
};

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const LABELS = { SIDES, STATUSES, AVAIL, VENTURE, STAGES };
