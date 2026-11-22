import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { EVENT, DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from './lib/constants';
import { computeScores, pairKey } from './engine/scoring';
import { schedule, scheduleStats, analyzeGaps, activeIds, roundTime, roundEnd, members } from './engine/scheduler';
import { adminApi, boardHash } from './lib/cloud';
import QrModal from './components/QrModal';
import { M } from './components/ui';
import SetupTab from './tabs/SetupTab';
import ParticipantsTab from './tabs/ParticipantsTab';
import EngineTab from './tabs/EngineTab';
import BoardTab from './tabs/BoardTab';
import ExportTab from './tabs/ExportTab';
import LiveTab from './tabs/LiveTab';

const STORE = 'matchpoint-state-v1';
const loadState = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
};

const TABS = [
  { id: 'setup', num: '01', label: 'הגדרות וטעינת נתונים' },
  { id: 'people', num: '02', label: "משתתפים וצ'ק-אין" },
  { id: 'live', num: '03', label: 'ערב האירוע: העדפות ופרסום', live: true },
  { id: 'engine', num: '04', label: 'מנוע שיבוץ ומשקלים' },
  { id: 'board', num: '05', label: 'לוח סבבים ושולחנות' },
  { id: 'export', num: '06', label: 'ייצוא והפצה' },
];

export default function App() {
  const saved = useMemo(loadState, []);
  const [tab, setTab] = useState(saved?.tab || 'setup');
  const [participants, setParticipants] = useState(saved?.participants || []);
  const [settings, setSettingsRaw] = useState(() => {
    const s = { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) };
    // engine v2: minimum of 3 consecutive meetings at the start replaces the old "2 + lower threshold" rule
    return saved?.settings?.engineVersion === 3 ? s : { ...s, minMeetings: Math.max(3, Number(s.minMeetings) || 3), engineVersion: 3 };
  });
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS, ...(saved?.weights || {}) });
  const [constraints, setConstraints] = useState(saved?.constraints || { must: [], exclude: [] });
  const [meetings, setMeetings] = useState(saved?.meetings || []);
  const [lastRun, setLastRun] = useState(saved?.lastRun || null);
  const [theme, setTheme] = useState(saved?.theme || 'light');
  const [cloud, setCloud] = useState({ key: '', tokens: {}, ...(saved?.cloud || {}) });
  const [toast, setToast] = useState(null);

  const setSettings = useCallback((patch) => setSettingsRaw((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ tab, participants, settings, weights, constraints, meetings, lastRun, theme, cloud }));
    } catch { /* storage unavailable – app still works in-memory */ }
  }, [tab, participants, settings, weights, constraints, meetings, lastRun, theme, cloud]);

  // full staff-state snapshot for the cloud backup
  const snapshot = useCallback(
    () => ({ participants, settings, weights, constraints, meetings, lastRun }),
    [participants, settings, weights, constraints, meetings, lastRun],
  );
  const restore = useCallback((s) => {
    if (!s) return;
    setParticipants(s.participants || []);
    setSettingsRaw({ ...DEFAULT_SETTINGS, ...(s.settings || {}) });
    setWeights({ ...DEFAULT_WEIGHTS, ...(s.weights || {}) });
    setConstraints(s.constraints || { must: [], exclude: [] });
    setMeetings(s.meetings || []);
    setLastRun(s.lastRun || null);
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const notify = useCallback((msg, kind = 'ok') => setToast({ msg, kind, t: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const h = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(h);
  }, [toast]);

  const byId = useMemo(() => Object.fromEntries(participants.map((p) => [p.id, p])), [participants]);
  const scores = useMemo(
    () => computeScores(participants, weights, settings, constraints),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participants, weights, settings.allowSameSide, settings.enforceVentureRule, constraints],
  );
  const active = useMemo(() => activeIds(participants, settings), [participants, settings]);
  const gaps = useMemo(() => analyzeGaps(participants, active, scores, settings), [participants, active, scores, settings]);
  const visibleMeetings = useMemo(() => meetings.filter((m) => m.round <= settings.rounds), [meetings, settings.rounds]);
  const stats = useMemo(() => scheduleStats(visibleMeetings, active, settings, scores), [visibleMeetings, active, settings, scores]);

  // meetings whose participant is no longer active (no-show / cancelled)
  const broken = useMemo(() => {
    const act = new Set(active);
    return visibleMeetings.filter((m) => members(m).some((id) => !act.has(id)));
  }, [visibleMeetings, active]);

  const run = useCallback((mode) => {
    if (active.length < 2) { notify('אין מספיק משתתפים שסומנו כ״הגיע״ לשיבוץ', 'err'); return; }
    // every present participant must be seated in each of the first rounds: refuse an impossible schedule
    const need = Math.floor(active.length / 2);
    if (Number(settings.tables) < need) {
      notify(`לא ניתן להבטיח ${settings.minMeetings} פגישות רצופות לכל ${active.length} הנוכחים: צריך לפחות ${need} שולחנות (מוגדרים ${settings.tables}). עדכנו בטאב 01.`, 'err');
      return;
    }
    const res = schedule({ participants, scores, settings, constraints, existing: meetings, mode });
    setMeetings(res.meetings);
    setLastRun({ at: new Date().toISOString(), ...res.log, total: res.meetings.length });
    const added = res.log.auto + res.log.fallback + res.log.must + (res.log.wildcard || 0);
    if (res.log.unseated?.length) {
      notify(`אזהרה: ${res.log.unseated.reduce((n, u) => n + u.ids.length, 0)} מקומות לא שובצו בסבבים הראשונים (החרגות). בדקו בטאב 04.`, 'err');
      return;
    }
    notify(
      mode === 'preserve'
        ? `שיבוץ מחדש: נשמרו ${res.log.kept} פגישות, בוטלו ${res.log.dropped}, נוספו ${added}`
        : `שובצו ${res.meetings.length} פגישות ב-${settings.rounds} סבבים`,
    );
  }, [active.length, participants, scores, settings, constraints, meetings, notify]);

  const addConstraint = useCallback((type, a, b) => {
    if (!a || !b || a === b) return;
    setConstraints((c) => {
      const k = pairKey(a, b);
      if (c[type].some(([x, y]) => pairKey(x, y) === k)) return c;
      const other = type === 'must' ? 'exclude' : 'must';
      return { ...c, [type]: [...c[type], [a, b]], [other]: c[other].filter(([x, y]) => pairKey(x, y) !== k) };
    });
  }, []);
  const removeConstraint = useCallback((type, a, b) => {
    const k = pairKey(a, b);
    setConstraints((c) => ({ ...c, [type]: c[type].filter(([x, y]) => pairKey(x, y) !== k) }));
  }, []);

  // ── Pitch: local source of truth, mirrored to the cloud so phones show the badge ──
  const pitchedIds = useMemo(
    () => participants.filter((p) => p.didPitch).sort((a, b) => (a.pitchAt || 0) - (b.pitchAt || 0)).map((p) => p.id),
    [participants],
  );
  const togglePitch = useCallback((id) => setParticipants((ps) => ps.map((p) => (
    p.id === id ? { ...p, didPitch: !p.didPitch, pitchAt: p.didPitch ? null : Date.now() } : p
  ))), []);
  const [pitchSync, setPitchSync] = useState(null);
  const pitchKey = pitchedIds.join(',');
  const firstPitchRun = useRef(true);
  useEffect(() => {
    if (firstPitchRun.current) { firstPitchRun.current = false; return undefined; } // don't overwrite the cloud on page load
    if (!cloud.key) return undefined;
    const h = setTimeout(() => {
      adminApi(cloud.key).setPitched(pitchKey ? pitchKey.split(',') : [])
        .then(() => setPitchSync({ ok: true, at: new Date().toISOString() }))
        .catch((e) => setPitchSync({ ok: false, error: e.message }));
    }, 400);
    return () => clearTimeout(h);
  }, [pitchKey, cloud.key]);

  // ── 🚀 publish the current board to every participant's phone ──
  const publishLive = useCallback(async () => {
    if (!cloud.key) { notify('יש להתחבר לענן בטאב 03 (מפתח צוות) לפני פרסום', 'err'); setTab('live'); return false; }
    if (!visibleMeetings.length) { notify('אין לוח שיבוץ לפרסום', 'err'); return false; }
    try {
      const hash = boardHash(visibleMeetings);
      await adminApi(cloud.key).publishSchedule({
        meetings: visibleMeetings.map(({ round, table, a, b, c, source }) => ({ round, table, a, b, ...(c ? { c } : {}), wild: source === 'wildcard' })),
        times: Array.from({ length: settings.rounds }, (_, i) => ({ round: i + 1, start: roundTime(settings, i + 1), end: roundEnd(settings, i + 1) })),
        hash,
      });
      setCloud((c) => ({ ...c, publishedHash: hash, publishedAt: new Date().toISOString() }));
      notify('🚀 הלו״ז פורסם – הטלפונים של המשתתפים מתעדכנים עכשיו');
      return true;
    } catch (e) {
      notify(e.message, 'err');
      return false;
    }
  }, [cloud.key, visibleMeetings, settings, notify]);
  const firstSyncRun = useRef(true);
  useEffect(() => {
    if (firstSyncRun.current) { firstSyncRun.current = false; return undefined; }
    if (!cloud.key) return undefined;
    const h = setTimeout(() => { adminApi(cloud.key).saveStaff(snapshot()).catch(() => {}); }, 2000);
    return () => clearTimeout(h);
  }, [participants, meetings, settings, constraints, weights, cloud.key, snapshot]);

  const [qrOpen, setQrOpen] = useState(false);
  const openQr = useCallback(() => setQrOpen(true), []);
  const boardDirty = !!cloud.publishedHash && cloud.publishedHash !== boardHash(visibleMeetings);

  const ctx = {
    participants, setParticipants, byId, settings, setSettings, weights, setWeights,
    constraints, setConstraints, addConstraint, removeConstraint,
    meetings: visibleMeetings, setMeetings, scores, active, gaps, stats, broken, lastRun, run, notify, setTab,
    cloud, setCloud, snapshot, restore,
    pitchedIds, togglePitch, pitchSync, publishLive, openQr, boardDirty,
  };

  const checkedIn = participants.filter((p) => p.status === 'checked_in').length;

  return (
    <>
      <header className="hdr">
        <div>
          <div className="kicker">
            <M>The Platform</M> / <span className="he">הרציף</span> · <M>Co-Founder Speed-Dating · Ops Console</M>
          </div>
          <h1>
            {EVENT.titleHe} <M>{EVENT.titleEn}</M>
            <span className="pipe">|</span>
            <M className="brand">{EVENT.brand}</M>
          </h1>
        </div>
        <div className="hdr-blocks">
          <M className="blk">{EVENT.date} | {EVENT.doors}</M>
          <span className="blk">{EVENT.address}</span>
          <span className={`live-pill ${checkedIn ? 'on' : ''}`} title="רק מי שסומן ״הגיע״ משובץ">
            <span className="dot" />
            נוכחים {checkedIn}/{participants.length}
          </span>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="החלף מצב תצוגה">
            {theme === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="num">{t.num} /</span>
            <span className="lbl">{t.label}</span>
            {t.live && <span className="badge">LIVE</span>}
            {t.id === 'board' && broken.length > 0 && <span className="badge">{broken.length}!</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'setup' && <SetupTab {...ctx} setWeights={setWeights} setLastRun={setLastRun} />}
        {tab === 'people' && <ParticipantsTab {...ctx} />}
        {tab === 'live' && <LiveTab {...ctx} />}
        {tab === 'engine' && <EngineTab {...ctx} />}
        {tab === 'board' && <BoardTab {...ctx} />}
        {tab === 'export' && <ExportTab {...ctx} />}
      </main>

      {qrOpen && <QrModal onClose={() => setQrOpen(false)} />}
      {toast && <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </>
  );
}
