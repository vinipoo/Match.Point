import { useEffect, useMemo, useState, useCallback } from 'react';
import { EVENT, DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from './lib/constants';
import { computeScores, pairKey } from './engine/scoring';
import { schedule, scheduleStats, analyzeGaps, activeIds } from './engine/scheduler';
import { M } from './components/ui';
import SetupTab from './tabs/SetupTab';
import ParticipantsTab from './tabs/ParticipantsTab';
import EngineTab from './tabs/EngineTab';
import BoardTab from './tabs/BoardTab';
import ExportTab from './tabs/ExportTab';

const STORE = 'matchpoint-state-v1';
const loadState = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
};

const TABS = [
  { id: 'setup', num: '01', label: 'הגדרות וטעינת נתונים' },
  { id: 'people', num: '02', label: "משתתפים וצ'ק-אין", live: true },
  { id: 'engine', num: '03', label: 'מנוע שיבוץ ומשקלים' },
  { id: 'board', num: '04', label: 'לוח סבבים ושולחנות' },
  { id: 'export', num: '05', label: 'ייצוא והפצה' },
];

export default function App() {
  const saved = useMemo(loadState, []);
  const [tab, setTab] = useState(saved?.tab || 'setup');
  const [participants, setParticipants] = useState(saved?.participants || []);
  const [settings, setSettingsRaw] = useState({ ...DEFAULT_SETTINGS, ...(saved?.settings || {}) });
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS, ...(saved?.weights || {}) });
  const [constraints, setConstraints] = useState(saved?.constraints || { must: [], exclude: [] });
  const [meetings, setMeetings] = useState(saved?.meetings || []);
  const [lastRun, setLastRun] = useState(saved?.lastRun || null);
  const [theme, setTheme] = useState(saved?.theme || 'light');
  const [toast, setToast] = useState(null);

  const setSettings = useCallback((patch) => setSettingsRaw((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ tab, participants, settings, weights, constraints, meetings, lastRun, theme }));
    } catch { /* storage unavailable – app still works in-memory */ }
  }, [tab, participants, settings, weights, constraints, meetings, lastRun, theme]);

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
    return visibleMeetings.filter((m) => !act.has(m.a) || !act.has(m.b));
  }, [visibleMeetings, active]);

  const run = useCallback((mode) => {
    if (active.length < 2) { notify('אין מספיק משתתפים פעילים לשיבוץ', 'err'); return; }
    const res = schedule({ participants, scores, settings, constraints, existing: meetings, mode });
    setMeetings(res.meetings);
    setLastRun({ at: new Date().toISOString(), ...res.log, total: res.meetings.length });
    const added = res.log.auto + res.log.fallback + res.log.must;
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

  const ctx = {
    participants, setParticipants, byId, settings, setSettings, weights, setWeights,
    constraints, setConstraints, addConstraint, removeConstraint,
    meetings: visibleMeetings, setMeetings, scores, active, gaps, stats, broken, lastRun, run, notify, setTab,
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
          <span className={`live-pill ${settings.liveMode ? 'on' : ''}`} title="מצב LIVE: רק מי שעשה צ'ק-אין משובץ">
            <span className="dot" />
            {settings.liveMode ? 'LIVE' : 'PRE-EVENT'} · {checkedIn}/{participants.length}
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
        {tab === 'engine' && <EngineTab {...ctx} />}
        {tab === 'board' && <BoardTab {...ctx} />}
        {tab === 'export' && <ExportTab {...ctx} />}
      </main>

      {toast && <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </>
  );
}
