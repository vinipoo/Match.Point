import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENT, SIDES } from '../lib/constants';
import { participantApi, countdown } from '../lib/cloud';
import { M, SideTag } from '../components/ui';
import './participant.css';

const pad = (n) => String(n).padStart(2, '0');
const POLL_MS = 8000;

function ProfileCard({ p, rank, pitched, canAdd, open, onToggle }) {
  const [more, setMore] = useState(false);
  return (
    <article className={`pp-card ${rank ? 'chosen' : ''}`}>
      <div className="pp-card-top">
        <M className="pp-id">{p.id}</M>
        <div className="pp-name">{p.name}</div>
        <SideTag side={p.side} />
        {pitched && <span className="tag tag-mag">הציג/ה Pitch</span>}
      </div>
      {p.industry?.length > 0 && (
        <div className="chips">{p.industry.map((x) => <span key={x} className="tag">{x}</span>)}</div>
      )}
      {(p.idea || p.brings) && (
        <button type="button" className={`pp-text ${more ? 'open' : ''}`} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {p.idea && <span className="pp-idea"><b>המיזם: </b>{p.idea}</span>}
          {p.brings && <span className="pp-brings"><b>ניסיון: </b>{p.brings}</span>}
        </button>
      )}
      {open && (
        <button
          type="button"
          className={`btn pp-pick ${rank ? 'btn-lime' : ''}`}
          disabled={!rank && !canAdd}
          onClick={() => onToggle(p.id)}
        >
          {rank ? <>✓ בחירה מס׳ <M>{rank}</M> · הסר</> : canAdd ? '+ רוצה לפגוש' : 'הגעת למקסימום בחירות'}
        </button>
      )}
    </article>
  );
}

export default function ParticipantApp({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [list, setList] = useState([]);
  const [save, setSave] = useState({ state: 'idle', at: null });
  const [view, setView] = useState('browse');
  const [q, setQ] = useState('');
  const [side, setSide] = useState('all');
  const [industry, setIndustry] = useState('');
  const [pitchedOnly, setPitchedOnly] = useState(false);
  const [now, setNow] = useState(Date.now());
  const dirty = useRef(false);
  const offset = useRef(0);
  const saveTimer = useRef(null);
  const autoView = useRef(false);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await participantApi.load(token);
      offset.current = Date.parse(d.serverNow) - Date.now();
      setData(d);
      setError('');
      if (!dirty.current) {
        setList(d.prefs || []);
        if (d.prefsAt) setSave((s) => (s.state === 'idle' || s.state === 'saved' ? { state: 'saved', at: d.prefsAt } : s));
      }
      hasData.current = true;
      if (d.schedule && !autoView.current) { autoView.current = true; setView('schedule'); }
    } catch (e) {
      // keep showing the last good data on a transient network error
      if (e.status === 404 || !hasData.current) setError(e.message);
    }
  }, [token]);

  useEffect(() => {
    load();
    const h = setInterval(load, POLL_MS);
    return () => clearInterval(h);
  }, [load]);

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const phase = data?.event.phase || 'setup';
  const closesAt = data?.event.closesAt ? Date.parse(data.event.closesAt) : null;
  const left = closesAt ? closesAt - (now + offset.current) : 0;
  const isOpen = phase === 'open' && left > 0;
  const max = data?.event.maxChoices || 5;

  const persist = useCallback((next) => {
    dirty.current = true;
    setSave({ state: 'saving', at: null });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await participantApi.savePrefs(token, next);
        dirty.current = false;
        setSave({ state: 'saved', at: r.at });
      } catch (e) {
        setSave({ state: 'error', at: null, msg: e.message });
        if (e.status === 409) { dirty.current = false; load(); }
      }
    }, 450);
  }, [token, load]);

  const update = (next) => { setList(next); persist(next); };
  const toggle = (id) => update(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  const byId = useMemo(() => Object.fromEntries((data?.roster || []).map((p) => [p.id, p])), [data]);
  const pitchedSet = useMemo(() => new Set(data?.pitched || []), [data]);
  const industries = useMemo(() => [...new Set((data?.roster || []).flatMap((p) => p.industry || []))].sort(), [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    const order = new Map((data.pitched || []).map((id, i) => [id, i]));
    return data.roster
      .filter((p) => p.id !== data.me.id)
      .filter((p) => side === 'all' || p.side === side)
      .filter((p) => !industry || (p.industry || []).includes(industry))
      .filter((p) => !pitchedOnly || pitchedSet.has(p.id))
      .filter((p) => !t || [p.name, p.id, p.idea, p.brings, ...(p.industry || [])].join(' ').toLowerCase().includes(t))
      .sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e6) - (order.has(b.id) ? order.get(b.id) : 1e6) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  }, [data, q, side, industry, pitchedOnly, pitchedSet]);

  if (error && !data) {
    return (
      <div className="pp">
        <header className="pp-hdr"><M className="brand">{EVENT.brand}</M></header>
        <main className="pp-main"><div className="pp-banner warn"><b>{error}</b></div></main>
      </div>
    );
  }
  if (!data) return <div className="pp"><main className="pp-main"><div className="pp-banner">טוען…</div></main></div>;

  const currentRound = (() => {
    if (!data.schedule) return null;
    const d = new Date(now + offset.current);
    const mins = d.getHours() * 60 + d.getMinutes();
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const cur = data.schedule.find((s) => mins >= toMin(s.start) - 2 && mins < toMin(s.end));
    return cur?.round ?? null;
  })();

  return (
    <div className="pp">
      <header className="pp-hdr">
        <div className="pp-hdr-row">
          <M className="brand">{EVENT.brand}</M>
          <M className="pp-date">{EVENT.date}</M>
        </div>
        <div className="pp-me">
          <span>שלום, <b>{data.me.name}</b></span> <M className="pp-id inv">{data.me.id}</M> <SideTag side={data.me.side} />
        </div>
      </header>

      {phase === 'setup' && (
        <div className="pp-banner">בחירת האנשים תיפתח בהפסקה שאחרי הפיצ׳ים. בינתיים אפשר לעיין בפרופילים.</div>
      )}
      {phase === 'open' && isOpen && (
        <div className="pp-banner live">
          <div><b>בחרו עד <M>{max}</M> אנשים שתרצו לפגוש</b><div className="small">מסודרים לפי עדיפות: מס׳ 1 = הכי חשוב</div></div>
          <M className="pp-count">{countdown(left)}</M>
        </div>
      )}
      {(phase === 'closed' || (phase === 'open' && !isOpen)) && (
        <div className="pp-banner">ההגשה נסגרה ✓ השיבוץ בהכנה – הלו״ז האישי יופיע כאן בעוד כמה דקות.</div>
      )}
      {phase === 'published' && !data.schedule && <div className="pp-banner">הלו״ז מתעדכן…</div>}

      <nav className="pp-nav">
        {data.schedule && <button className={view === 'schedule' ? 'on' : ''} onClick={() => setView('schedule')}>הלו״ז שלי</button>}
        <button className={view === 'browse' ? 'on' : ''} onClick={() => setView('browse')}>משתתפים <M>{data.roster.length - 1}</M></button>
        <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>הבחירות שלי <M>{list.length}/{max}</M></button>
      </nav>

      <main className="pp-main">
        {view === 'schedule' && data.schedule && (
          <div className="pp-stack">
            {data.schedule.map((s) => (
              <div key={s.round} className={`pp-slot ${s.round === currentRound ? 'now' : ''} ${s.partner ? '' : 'free'}`}>
                <div className="pp-slot-side">
                  <div className="small">שולחן</div>
                  <M className="pp-table">{s.table ? pad(s.table) : '—'}</M>
                </div>
                <div className="pp-slot-body">
                  <div className="pp-slot-time">
                    סבב <M>{pad(s.round)}</M> · <M>{s.start}–{s.end}</M>
                    {s.round === currentRound && <span className="tag tag-mag">עכשיו</span>}
                  </div>
                  {s.partner ? (
                    <>
                      <div className="pp-name">{s.partner.name} <SideTag side={s.partner.side} /></div>
                      {s.partner.idea && <div className="small">{s.partner.idea}</div>}
                    </>
                  ) : (
                    <div className="pp-name muted">נטוורקינג חופשי ☕</div>
                  )}
                </div>
              </div>
            ))}
            <p className="small muted">הלו״ז עשוי להתעדכן אם מישהו לא הגיע – הדף מתרענן לבד.</p>
          </div>
        )}

        {view === 'mine' && (
          <div className="pp-stack">
            {list.length === 0 && <div className="pp-banner">עדיין לא בחרת אף אחד. עברו ל״משתתפים״ ולחצו ״רוצה לפגוש״.</div>}
            {list.map((id, i) => {
              const p = byId[id];
              if (!p) return null;
              return (
                <div key={id} className="pp-rank">
                  <M className="pp-rank-no">{i + 1}</M>
                  <div className="pp-rank-body">
                    <div className="pp-name">{p.name} <SideTag side={p.side} /></div>
                    {p.idea && <div className="small muted pp-clamp">{p.idea}</div>}
                  </div>
                  {isOpen && (
                    <div className="pp-rank-acts">
                      <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="העלה עדיפות">▲</button>
                      <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="הורד עדיפות">▼</button>
                      <button className="btn btn-sm btn-danger" onClick={() => toggle(id)} aria-label="הסר">✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === 'browse' && (
          <div className="pp-stack">
            <input className="input" placeholder="חיפוש שם, מזהה, מיזם או תחום…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pp-filters">
              <div className="seg">
                {[['all', 'הכול'], ['tech', SIDES.tech.he], ['business', SIDES.business.he]].map(([k, l]) => (
                  <button key={k} className={side === k ? 'on confirmed' : ''} onClick={() => setSide(k)}>{l}</button>
                ))}
              </div>
              <select className="select" value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="תחום">
                <option value="">כל התחומים</option>
                {industries.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              {pitchedSet.size > 0 && (
                <button className={`btn btn-sm ${pitchedOnly ? 'btn-mag' : ''}`} onClick={() => setPitchedOnly((v) => !v)}>רק מי שהציג/ה</button>
              )}
            </div>
            <div className="small muted"><M>{shown.length}</M> משתתפים</div>
            {shown.map((p) => (
              <ProfileCard key={p.id} p={p} rank={list.indexOf(p.id) + 1 || 0} pitched={pitchedSet.has(p.id)}
                canAdd={list.length < max} open={isOpen} onToggle={toggle} />
            ))}
          </div>
        )}
      </main>

      {(isOpen || save.state === 'error') && (
        <footer className={`pp-save ${save.state}`} role="status">
          {save.state === 'saving' && 'שומר…'}
          {save.state === 'saved' && <>נשמר ✓ <M>{list.length}/{max}</M></>}
          {save.state === 'idle' && <>בחרת <M>{list.length}/{max}</M></>}
          {save.state === 'error' && <>{save.msg || 'לא נשמר'} <button className="btn btn-sm" onClick={() => persist(list)}>נסו שוב</button></>}
        </footer>
      )}
    </div>
  );
}
