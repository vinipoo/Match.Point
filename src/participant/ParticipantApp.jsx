import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENT, SIDES } from '../lib/constants';
import { participantApi, countdown } from '../lib/cloud';
import { M, SideTag } from '../components/ui';
import './participant.css';

const pad = (n) => String(n).padStart(2, '0');
const POLL_MS = 10000;
const TOKEN_KEY = 'mp-participant-token';
const looksLikeToken = (v) => /^[A-Za-z0-9]{12}$/.test(v || '') && !/^P\d+$/i.test(v || '');
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
  json: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
};
const PitchBadge = ({ n }) => (n ? <span className="tag tag-mag pp-pitch">🎤 מציג/ה Pitch <M>#{n}</M></span> : null);
const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + m; };

function Shell({ children, me, onLogout }) {
  return (
    <div className="pp">
      <header className="pp-hdr">
        <div className="pp-hdr-row">
          <M className="brand">{EVENT.brand}</M>
          <M className="pp-date">{EVENT.date} · {EVENT.venueEn}</M>
        </div>
        {me && (
          <div className="pp-me">
            <span>שלום, <b>{me.name}</b></span> <M className="pp-id inv">{me.id}</M> <SideTag side={me.side} />
            <button className="pp-link" onClick={onLogout}>לא את/ה?</button>
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

// ───────────── login: name + last 4 phone digits ─────────────
function Login({ prefillId, onLoggedIn }) {
  const [dir, setDir] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    participantApi.directory()
      .then((d) => {
        setDir(d.participants);
        const pre = prefillId && d.participants.find((p) => p.id.toLowerCase() === prefillId.toLowerCase());
        if (pre) setSel(pre);
      })
      .catch((e) => setErr(e.message));
  }, [prefillId]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!dir || !t) return [];
    return dir.filter((p) => p.name.toLowerCase().includes(t) || p.id.toLowerCase() === t).slice(0, 8);
  }, [dir, q]);

  const submit = async (e) => {
    e.preventDefault();
    if (!sel || digits.length !== 4) return;
    setBusy(true);
    setErr('');
    try {
      const r = await participantApi.login(sel.id, digits);
      onLoggedIn(r.token);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="pp-main">
        <div className="pp-login">
          <h1>כניסה לערב</h1>
          <p className="small muted">בחרו את השם שלכם ואמתו עם 4 הספרות האחרונות של הטלפון.</p>
          {!dir && !err && <div className="pp-banner">טוען…</div>}
          {dir && dir.length === 0 && <div className="pp-banner">רשימת המשתתפים עוד לא פורסמה. נסו שוב בעוד רגע.</div>}
          {dir && dir.length > 0 && (
            <form onSubmit={submit} className="pp-stack">
              {!sel ? (
                <>
                  <input className="input" autoFocus placeholder="הקלידו את השם שלכם…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש שם" />
                  <div className="pp-stack" style={{ gap: 6 }}>
                    {matches.map((p) => (
                      <button type="button" key={p.id} className="pp-pickname" onClick={() => setSel(p)}>
                        <span>{p.name}</span> <M className="pp-id">{p.id}</M>
                      </button>
                    ))}
                    {q.trim() && matches.length === 0 && <div className="small muted">לא נמצא. נסו חלק מהשם, או פנו לצוות.</div>}
                  </div>
                </>
              ) : (
                <>
                  <div className="pp-pickname on">
                    <span>{sel.name}</span> <M className="pp-id">{sel.id}</M>
                    <button type="button" className="pp-link" onClick={() => { setSel(null); setDigits(''); }}>שינוי</button>
                  </div>
                  <label className="field">
                    <span>4 הספרות האחרונות של הטלפון</span>
                    <input className="input mono pp-digits" inputMode="numeric" autoComplete="off" maxLength={4} autoFocus
                      value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  </label>
                  <button className="btn btn-lime pp-pick" disabled={busy || digits.length !== 4}>{busy ? 'נכנס…' : 'כניסה'}</button>
                </>
              )}
            </form>
          )}
          {err && <div className="pp-banner warn" role="alert">{err}</div>}
        </div>
      </main>
    </Shell>
  );
}

// ───────────── profile card ─────────────
function ProfileCard({ p, rank, canAdd, open, onToggle, max }) {
  const [more, setMore] = useState(false);
  return (
    <article className={`pp-card ${rank ? 'chosen' : ''}`}>
      <div className="pp-card-top">
        <M className="pp-id">{p.id}</M>
        <div className="pp-name">{p.name}</div>
        <SideTag side={p.side} />
        <PitchBadge n={p.pitchNo} />
      </div>
      {(p.brings || p.stage) && (
        <div className="pp-summary">
          {p.brings && <span><b>מביא/ה: </b>{p.brings}</span>}
          {p.stage && <span className="tag">שלב: {p.stage}</span>}
        </div>
      )}
      {p.seeking && <div className="pp-seeking"><b>מחפש/ת: </b>{p.seeking}</div>}
      {p.idea && (
        <button type="button" className={`pp-text ${more ? 'open' : ''}`} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          <span className="pp-idea"><b>המיזם: </b>{p.idea}</span>
        </button>
      )}
      {p.industry?.length > 0 && (
        <div className="chips">
          {p.industry.map((x) => <span key={x} className="tag">{x === 'אחר' && p.industryOther?.length ? `אחר: ${p.industryOther.join(', ')}` : x}</span>)}
        </div>
      )}
      {/* always rendered, so it's clear why it can't be pressed yet */}
      <button
        type="button"
        className={`btn pp-pick ${rank ? 'btn-lime' : ''}`}
        disabled={!open || (!rank && !canAdd)}
        aria-pressed={!!rank}
        onClick={() => onToggle(p.id)}
      >
        {!open
          ? (rank ? <>✓ בחירה מס׳ <M>{rank}</M></> : 'הבחירה תיפתח כשהצוות יפתח את הדירוג')
          : rank ? <>✓ עדיפות <M>{rank}</M> · הסר</> : canAdd ? '+ רוצה לפגוש' : `בחרת כבר ${max} – הסירו מישהו כדי להוסיף`}
      </button>
    </article>
  );
}

// ───────────── logged-in portal ─────────────
function Portal({ token, onLogout, onInvalid }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [list, setList] = useState([]);
  const [save, setSave] = useState({ state: 'idle' });
  const [view, setView] = useState('browse');
  const [q, setQ] = useState('');
  const [side, setSide] = useState('all');
  const [industry, setIndustry] = useState('');
  const [pitchOnly, setPitchOnly] = useState(false);
  const [forMe, setForMe] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [changed, setChanged] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const dirty = useRef(false);
  const offset = useRef(0);
  const saveTimer = useRef(null);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await participantApi.load(token);
      offset.current = Date.parse(d.serverNow) - Date.now();
      hasData.current = true;
      setData(d);
      setError('');
      if (!dirty.current) setList(d.prefs || []);
    } catch (e) {
      if (e.status === 404) onInvalid();
      else if (!hasData.current) setError(e.message);
    }
  }, [token, onInvalid]);

  useEffect(() => {
    load();
    const h = setInterval(load, POLL_MS);
    return () => clearInterval(h);
  }, [load]);
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  // new schedule version -> jump to "my schedule" and flag changes in upcoming rounds
  useEffect(() => {
    if (!data?.schedule || !data.publishedAt) return;
    const key = `mp-sched-${data.me.id}`;
    const prev = store.json(key);
    if (prev?.publishedAt === data.publishedAt) return;
    const slots = Object.fromEntries(data.schedule.map((s) => [s.round, `${s.table ?? '-'}|${s.partner?.id ?? 'free'}|${s.partner2?.id ?? ''}`]));
    if (prev?.slots) {
      const d = new Date(Date.now() + offset.current);
      const nowMin = d.getHours() * 60 + d.getMinutes();
      setChanged(data.schedule.filter((s) => prev.slots[s.round] !== undefined && prev.slots[s.round] !== slots[s.round] && toMin(s.end) > nowMin).map((s) => s.round));
    }
    store.set(key, JSON.stringify({ publishedAt: data.publishedAt, slots }));
    setView('schedule');
  }, [data]);

  const phase = data?.event.phase || 'setup';
  const closesAt = data?.event.closesAt ? Date.parse(data.event.closesAt) : null;
  const left = closesAt ? closesAt - (now + offset.current) : 0;
  // only staff lock voting – the timer is display-only
  const isOpen = phase === 'open';
  const isLocked = phase === 'closed';
  const isLive = phase === 'published';
  const max = data?.event.maxChoices || 5;

  const persist = useCallback((next, immediate = false) => {
    dirty.current = true;
    setSave({ state: 'saving' });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await participantApi.savePrefs(token, next);
        dirty.current = false;
        setSave({ state: 'saved', at: r.at });
      } catch (e) {
        setSave({ state: 'error', msg: e.message });
        if (e.status === 409) { dirty.current = false; load(); }
      }
    }, immediate ? 0 : 450);
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

  const pitchedSet = useMemo(() => new Set(data?.pitched || []), [data]);
  const pitchNo = useMemo(() => new Map((data?.pitched || []).map((id, i) => [id, i + 1])), [data]);
  const roster = useMemo(() => (data?.roster || []).map((p) => ({ ...p, pitched: pitchedSet.has(p.id), pitchNo: pitchNo.get(p.id) || 0 })), [data, pitchedSet, pitchNo]);
  const byId = useMemo(() => Object.fromEntries(roster.map((p) => [p.id, p])), [roster]);
  // fixed domain list; every free-text "other" value is already grouped under a single "אחר"
  const industries = useMemo(() => {
    const all = [...new Set(roster.flatMap((p) => p.industry || []))];
    return all.filter((x) => x !== 'אחר').sort().concat(all.includes('אחר') ? ['אחר'] : []);
  }, [roster]);
  const me = data?.me;
  // complementary side: Tech sees Business (+ hybrid), Business sees Tech (+ hybrid), hybrid sees everyone
  const looksForMe = useCallback(
    (p) => !me || me.side === 'both' || p.side === 'both' || p.side !== me.side,
    [me],
  );

  const shown = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    const order = new Map((data.pitched || []).map((id, i) => [id, i]));
    return roster
      .filter((p) => p.id !== data.me.id)
      .filter((p) => side === 'all' || p.side === side)
      .filter((p) => !industry || (p.industry || []).includes(industry))
      .filter((p) => !pitchOnly || p.pitched)
      .filter((p) => !forMe || looksForMe(p))
      .filter((p) => !t || [p.name, p.id, p.idea, p.brings, p.seeking, ...(p.industry || [])].join(' ').toLowerCase().includes(t))
      .sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e6) - (order.has(b.id) ? order.get(b.id) : 1e6) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  }, [data, roster, q, side, industry, pitchOnly, forMe, looksForMe]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (error && !data) return <Shell><main className="pp-main"><div className="pp-banner warn">{error}</div></main></Shell>;
  if (!data) return <Shell><main className="pp-main"><div className="pp-banner">טוען…</div></main></Shell>;

  const d = new Date(now + offset.current);
  const nowMin = d.getHours() * 60 + d.getMinutes();
  const currentRound = data.schedule?.find((s) => nowMin >= toMin(s.start) - 2 && nowMin < toMin(s.end))?.round ?? null;

  return (
    <Shell me={data.me} onLogout={onLogout}>
      {phase === 'setup' && <div className="pp-banner">בחירת האנשים תיפתח בהפסקה שאחרי הפיצ׳ים. בינתיים אפשר לעיין בפרופילים.</div>}
      {isOpen && (
        <div className="pp-banner live">
          <div><b>הדירוג פתוח – בחרו עד <M>{max}</M> אנשים שתרצו לפגוש</b><div className="small">לפי עדיפות: מס׳ 1 = הכי חשוב · כל שינוי נשמר מיד</div></div>
          {closesAt && (left > 0 ? <M className="pp-count">{countdown(left)}</M> : <span className="small"><b>עוד רגע ננעל</b></span>)}
        </div>
      )}

      {isLocked ? (
        <main className="pp-main">
          <div className="pp-wait" role="status">
            <div className="pp-wait-icon" aria-hidden="true">⏳</div>
            <h2>הדירוג נסגר!</h2>
            <p>אנחנו משבצים את הפגישות שלכם ממש עכשיו...</p>
            <p className="small muted">הלו״ז האישי יופיע כאן אוטומטית – אין צורך לרענן.</p>
          </div>
          {list.length > 0 && (
            <div className="pp-stack" style={{ marginTop: 14 }}>
              <div className="small" style={{ fontWeight: 600 }}>הבחירות ששלחת:</div>
              {list.map((id, i) => byId[id] && (
                <div key={id} className="pp-rank">
                  <M className="pp-rank-no">{i + 1}</M>
                  <div className="pp-rank-body"><div className="pp-name">{byId[id].name} <SideTag side={byId[id].side} /></div></div>
                </div>
              ))}
            </div>
          )}
        </main>
      ) : (
      <>
      <nav className="pp-nav">
        {data.schedule && <button className={view === 'schedule' || isLive ? 'on' : ''} onClick={() => setView('schedule')}>הלו״ז שלי</button>}
        {!isLive && <button className={view === 'browse' ? 'on' : ''} onClick={() => setView('browse')}>משתתפים <M>{roster.length - 1}</M></button>}
        {!isLive && <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>הבחירות שלי <M>{list.length}/{max}</M></button>}
        <button className="pp-refresh" onClick={refresh} aria-label="רענון" title="רענון">{refreshing ? '…' : '↻'}</button>
      </nav>

      <main className="pp-main">
        {isLive && !data.schedule && <div className="pp-banner">הלו״ז שלך מתעדכן… אם הוא לא מופיע תוך דקה, פנו לצוות.</div>}
        {(view === 'schedule' || isLive) && data.schedule && (
          <div className="pp-stack">
            {data.schedule.map((s) => (
              <div key={s.round} className={`pp-slot ${s.round === currentRound ? 'now' : ''} ${s.partner ? '' : 'free'} ${changed.includes(s.round) ? 'changed' : ''}`}>
                <div className="pp-slot-side">
                  <div className="small">שולחן</div>
                  <M className="pp-table">{s.table ? pad(s.table) : '—'}</M>
                </div>
                <div className="pp-slot-body">
                  <div className="pp-slot-time">
                    סבב <M>{pad(s.round)}</M>
                    {s.round === currentRound && <span className="tag tag-mag">עכשיו</span>}
                  </div>
                  {s.partner ? (
                    <>
                      {s.partner2 && <span className="tag tag-dark" style={{ alignSelf: 'flex-start' }}>שולחן משולש</span>}
                      <div className="pp-name">{s.partner.name} <SideTag side={s.partner.side} /> <PitchBadge n={pitchNo.get(s.partner.id)} /></div>
                      {s.partner2 && <div className="pp-name">+ {s.partner2.name} <SideTag side={s.partner2.side} /> <PitchBadge n={pitchNo.get(s.partner2.id)} /></div>}
                      {s.partner.industry?.length > 0 && <div className="chips">{s.partner.industry.map((x) => <span key={x} className="tag">{x}</span>)}</div>}
                      {(s.partner.idea || s.partner.brings) && <div className="small pp-clamp">{s.partner.idea || s.partner.brings}</div>}
                    </>
                  ) : (
                    <div className="pp-name muted">סבב נטוורקינג חופשי – גשו לבר / לאזור המינגלינג ☕</div>
                  )}
                </div>
              </div>
            ))}
            <p className="small muted">הלו״ז מתעדכן אוטומטית אם מישהו לא הגיע.</p>
          </div>
        )}

        {!isLive && view === 'mine' && (
          <div className="pp-stack">
            {list.length === 0 && <div className="pp-banner">עדיין לא בחרת אף אחד. עברו ל״משתתפים״ ולחצו ״רוצה לפגוש״.</div>}
            {list.length > 0 && (
              <div className="pp-banner">
                <b>סדר עדיפות:</b> <M>1</M> = הכי חשוב לי. {isOpen ? 'שנו את הסדר עם החצים ▲▼ – עדיפות גבוהה מקבלת משקל גבוה יותר בשיבוץ.' : 'הסדר נשמר כפי ששלחת.'}
              </div>
            )}
            {list.map((id, i) => {
              const p = byId[id];
              if (!p) return null;
              return (
                <div key={id} className="pp-rank">
                  <M className="pp-rank-no" aria-label={`עדיפות ${i + 1}`}>{i + 1}</M>
                  <div className="pp-rank-body">
                    <div className="small" style={{ fontWeight: 700 }}>עדיפות {i + 1}{i === 0 ? ' · הכי חשוב' : ''}</div>
                    <div className="pp-name">{p.name} <SideTag side={p.side} /> <PitchBadge n={p.pitchNo} /></div>
                    {(p.idea || p.brings) && <div className="small muted pp-clamp">{p.idea || p.brings}</div>}
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

        {!isLive && view === 'browse' && (
          <div className="pp-stack">
            <input className="input" placeholder="חיפוש חופשי: שם, מזהה, מיזם, תחום…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש" />
            <div className="pp-filters">
              <button className={`btn btn-sm ${forMe ? 'btn-lime' : ''}`} aria-pressed={forMe} onClick={() => setForMe((v) => !v)}>🎯 הצג שותפים מהצד המשלים</button>
              <div className="seg" role="group" aria-label="Pitch">
                <button className={!pitchOnly ? 'on confirmed' : ''} onClick={() => setPitchOnly(false)}>כולם</button>
                <button className={pitchOnly ? 'on no_show' : ''} onClick={() => setPitchOnly(true)}>רק מציגי <M>Pitch</M></button>
              </div>
            </div>
            <div className="pp-filters">
              <div className="seg" role="group" aria-label="צד">
                {[['all', 'הכול'], ['tech', SIDES.tech.he], ['business', SIDES.business.he], ['both', SIDES.both.he]].map(([k, l]) => (
                  <button key={k} className={side === k ? 'on confirmed' : ''} onClick={() => setSide(k)}>{l}</button>
                ))}
              </div>
              <select className="select" value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="תחום">
                <option value="">כל התחומים</option>
                {industries.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="small muted"><M>{shown.length}</M> משתתפים</div>
            {shown.map((p) => (
              <ProfileCard key={p.id} p={p} rank={list.indexOf(p.id) + 1 || 0} canAdd={list.length < max} open={isOpen} onToggle={toggle} max={max} />
            ))}
          </div>
        )}
      </main>
      </>
      )}

      {(isOpen || save.state === 'error') && (
        <footer className={`pp-save ${save.state}`}>
          <span role="status" aria-live="polite">
            {save.state === 'saving' && 'שומר…'}
            {save.state === 'saved' && <>נשמר ✓ <M>{list.length}/{max}</M></>}
            {save.state === 'idle' && <>בחרת <M>{list.length}/{max}</M></>}
            {save.state === 'error' && (save.msg || 'לא נשמר')}
          </span>
          {isOpen && (
            <button className="btn btn-sm btn-lime" onClick={() => persist(list, true)} disabled={save.state === 'saving'}>
              {save.state === 'error' ? 'נסו שוב' : 'שמור בחירות'}
            </button>
          )}
        </footer>
      )}
    </Shell>
  );
}

export default function ParticipantApp() {
  const urlP = useMemo(() => new URLSearchParams(window.location.search).get('p') || '', []);
  const [token, setToken] = useState(() => (looksLikeToken(urlP) ? urlP : store.get(TOKEN_KEY)));
  const [hint, setHint] = useState(() => (urlP && !looksLikeToken(urlP) ? urlP : ''));

  useEffect(() => { if (token) store.set(TOKEN_KEY, token); }, [token]);

  const logout = useCallback(() => { store.del(TOKEN_KEY); setToken(null); setHint(''); }, []);
  const invalid = useCallback(() => { store.del(TOKEN_KEY); setToken(null); }, []);

  if (!token) return <Login prefillId={hint} onLoggedIn={setToken} />;
  return <Portal token={token} onLogout={logout} onInvalid={invalid} />;
}
