import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Kpi, M, SideTag, Alert, Empty } from '../components/ui';
import { adminApi, participantLink, boardHash, countdown } from '../lib/cloud';
import { inviteText, waLink, copyText } from '../lib/io';
import LivePublishBar from '../components/LivePublishBar';

import { toPublicProfile } from '../lib/profile';
const toPublic = (p) => ({ ...toPublicProfile(p), last4: String(p.phone || '').replace(/\D/g, '').slice(-4) });
const PHASE_LABEL = { setup: 'לפני ההפסקה', open: 'הגשה פתוחה', closed: 'הגשה סגורה', published: 'הלו״ז פורסם' };
const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function LiveTab(props) {
  const { participants, setParticipants, byId, meetings, cloud, setCloud, notify, setTab, run, snapshot, restore, pitchedIds, togglePitch, pitchSync, publishLive, openQr } = props;
  const [keyInput, setKeyInput] = useState(cloud.key || '');
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [maxChoices, setMaxChoices] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [pendingRun, setPendingRun] = useState(false);
  const offset = useRef(0);
  const api = useMemo(() => adminApi(cloud.key), [cloud.key]);

  const refresh = useCallback(async () => {
    if (!cloud.key) return;
    try {
      const s = await api.status();
      offset.current = Date.parse(s.serverNow) - Date.now();
      setStatus(s);
      setErr('');
      setCloud((c) => (JSON.stringify(c.tokens) === JSON.stringify(s.tokens) ? c : { ...c, tokens: s.tokens }));
    } catch (e) {
      setErr(e.message);
    }
  }, [api, cloud.key, setCloud]);

  const phase = status?.event?.phase || 'setup';
  useEffect(() => {
    refresh();
    const h = setInterval(refresh, phase === 'open' ? 4000 : 15000);
    return () => clearInterval(h);
  }, [refresh, phase]);
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  useEffect(() => {
    if (status?.event?.maxChoices) setMaxChoices(status.event.maxChoices);
  }, [status?.event?.maxChoices]);

  // run the scheduler once the merged preferences are in state
  useEffect(() => {
    if (!pendingRun) return;
    setPendingRun(false);
    run('fresh');
    setTab('board');
  }, [pendingRun, run, setTab]);

  const act = async (label, fn, okMsg) => {
    setBusy(label);
    try {
      const r = await fn();
      if (r?.event) { setStatus(r); setCloud((c) => ({ ...c, tokens: r.tokens || c.tokens })); }
      if (okMsg) notify(okMsg);
      return r;
    } catch (e) {
      notify(e.message, 'err');
      return null;
    } finally {
      setBusy('');
    }
  };

  const roster = participants.filter((p) => p.status !== 'no_show');
  const rosterIds = new Set(status?.rosterIds || []);
  const rosterOutdated = status && (roster.length !== rosterIds.size || roster.some((p) => !rosterIds.has(p.id)));
  const subs = status?.submissions || [];
  const subMap = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s.list])), [subs]);
  const notSubmitted = roster.filter((p) => rosterIds.has(p.id) && !subMap[p.id]?.length);
  const requested = useMemo(() => {
    const c = {};
    subs.forEach((s) => s.list.forEach((id, i) => { c[id] = c[id] || { n: 0, top: 0 }; c[id].n++; if (i === 0) c[id].top++; }));
    return Object.entries(c).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  }, [subs]);
  const mutualCount = useMemo(() => {
    let n = 0;
    subs.forEach((s) => s.list.forEach((id) => { if (s.id < id && subMap[id]?.includes(s.id)) n++; }));
    return n;
  }, [subs, subMap]);
  const pitched = pitchedIds;
  const closesAt = status?.event?.closesAt ? Date.parse(status.event.closesAt) : null;
  const left = closesAt ? closesAt - (now + offset.current) : 0;
  const localHash = boardHash(meetings);
  const published = status?.schedule;
  const boardChanged = published && published.hash !== localHash;

  const connect = () => {
    setCloud((c) => ({ ...c, key: keyInput.trim() }));
    setStatus(null);
    setErr('');
  };

  const mergePrefs = () => {
    const ids = new Set(participants.map((p) => p.id));
    let n = 0;
    setParticipants((ps) => ps.map((p) => {
      const list = subMap[p.id];
      if (!list) return p;
      n++;
      return { ...p, prefs: list.filter((id) => ids.has(id) && id !== p.id).map((id, i) => ({ id, rank: i + 1 })) };
    }));
    return n;
  };


  const copy = async (text, msg = 'הועתק ✓') => notify((await copyText(text)) ? msg : 'ההעתקה נכשלה', 'ok');

  return (
    <div className="stack">
      <Card num="03.A" title="חיבור לענן" en="Cloud · Live Event"
        actions={status && <span className={`tag ${status.storageError ? 'tag-mag' : status.storage === 'redis' ? 'tag-lime' : ''}`}>{status.storageError ? 'אחסון לא מחובר' : status.storage === 'redis' ? 'Upstash Redis ✓' : 'אחסון מקומי (פיתוח)'}</span>}>
        <div className="row">
          <label className="field" style={{ width: 260 }}>
            <span>מפתח צוות <M>ADMIN_KEY</M></span>
            <input className="input mono" type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} autoComplete="off" />
          </label>
          <button className="btn btn-dark" style={{ alignSelf: 'flex-end' }} onClick={connect}>התחבר</button>
          {status && !err && <span className="small" style={{ alignSelf: 'flex-end' }}>מחובר · שלב: <b>{PHASE_LABEL[phase]}</b></span>}
        </div>
        {err && <div style={{ marginTop: 10 }}><Alert tone="warn" icon="!" title={err} /></div>}
        {status?.storageError && <div style={{ marginTop: 10 }}><Alert tone="warn" icon="!" title={status.storageError} /></div>}
        {!cloud.key && <p className="small muted" style={{ margin: '10px 0 0' }}>הזינו את מפתח הצוות שהוגדר ב-Vercel כדי להפעיל את מצב הערב: קישורים אישיים, בחירת העדפות מהטלפון ופרסום הלו״ז.</p>}
      </Card>

      {!status ? (
        cloud.key && !err ? <Empty title="מתחבר…" /> : null
      ) : (
        <>
          <Card num="1" title="פרסום רשימת המשתתפים וקישורים אישיים" en="Roster & links">
            <div className="stack" style={{ gap: 12 }}>
              <div className="row">
                <button className="btn btn-lime" disabled={!roster.length || !!busy} onClick={() => act('roster', () => api.publishRoster(roster.map(toPublic)), `פורסמו ${roster.length} פרופילים`)}>
                  {rosterIds.size ? 'עדכן רשימה' : 'פרסם רשימה'} (<M>{roster.length}</M>)
                </button>
                <span className="small muted">בענן: <M>{rosterIds.size}</M> פרופילים · עודכן {fmt(status.event.rosterAt)} · ללא טלפון ומייל</span>
              </div>
              {rosterOutdated && rosterIds.size > 0 && <Alert tone="warn" icon="!" title="הרשימה המקומית שונה מזו שבענן – לחצו ״עדכן רשימה״." />}
              {rosterIds.size > 0 && (
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>קישורים אישיים ושליחה ב-WhatsApp</summary>
                  <div className="tbl-wrap" style={{ maxHeight: 360, marginTop: 8 }}>
                    <table className="tbl">
                      <thead><tr><th>ID</th><th>שם</th><th>טלפון</th><th>קישור</th><th /></tr></thead>
                      <tbody>
                        {roster.filter((p) => status.tokens[p.id]).map((p) => {
                          const link = participantLink(status.tokens[p.id]);
                          const text = inviteText(p, link);
                          return (
                            <tr key={p.id}>
                              <td className="num">{p.id}</td>
                              <td className="nowrap">{p.name}</td>
                              <td className="mono small">{p.phone}</td>
                              <td className="mono small" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</td>
                              <td className="nowrap">
                                <button className="btn btn-xs" onClick={() => copy(link, 'הקישור הועתק')}>העתק קישור</button>{' '}
                                <a className="btn btn-xs btn-lime" href={waLink(p.phone, text)} target="_blank" rel="noreferrer">שלח <M>WA</M></a>{' '}
                                <a className="btn btn-xs" href={link} target="_blank" rel="noreferrer">פתח</a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </Card>

          <Card num="2" title="מי הציג Pitch" en={`Pitched · ${pitched.length}`}>
            <p className="small muted" style={{ margin: '0 0 8px' }}>לחצו על שם בזמן הפיצ׳ים (או על 🎤 בטאב 02) – הפרופילים יקבלו תג ״הציג/ה Pitch״ ויופיעו ראשונים אצל המשתתפים, לפי סדר ההצגה.
              {pitchSync && <> · <span className={pitchSync.ok ? '' : 'tag tag-mag'}>{pitchSync.ok ? `סונכרן ${fmt(pitchSync.at)}` : `לא סונכרן: ${pitchSync.error}`}</span></>}</p>
            <div className="chips">
              {roster.filter((p) => rosterIds.has(p.id)).map((p) => {
                const i = pitched.indexOf(p.id);
                return (
                  <button key={p.id} className={`tag ${i >= 0 ? 'tag-mag' : ''}`} style={{ cursor: 'pointer', padding: '3px 8px' }} onClick={() => togglePitch(p.id)}>
                    {i >= 0 && <M>{i + 1}.</M>} {p.name}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card num="3" title="חלון הגשת העדפות (ההפסקה)" en={PHASE_LABEL[phase]}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="row">
                <label className="field" style={{ width: 110 }}>
                  <span>דקות</span>
                  <input className="input mono" type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 15)} />
                </label>
                <label className="field" style={{ width: 130 }}>
                  <span>מקס׳ בחירות</span>
                  <select className="select mono" value={maxChoices} onChange={(e) => setMaxChoices(Number(e.target.value))} disabled={phase === 'open'}>
                    {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                {phase !== 'open' ? (
                  <button className="btn btn-lime btn-lg" style={{ alignSelf: 'flex-end' }} disabled={!rosterIds.size || !!busy}
                    onClick={() => act('open', () => api.setPhase('open', { minutes, maxChoices }), 'ההגשה נפתחה')}>▶ פתח הגשה</button>
                ) : (
                  <>
                    <button className="btn" style={{ alignSelf: 'flex-end' }} disabled={!!busy}
                      onClick={() => act('extend', () => api.setPhase('open', { minutes: Math.max(1, Math.ceil(left / 60000)) + 5 }), 'נוספו 5 דקות')}>+5 דק׳</button>
                    <button className="btn btn-mag btn-lg" style={{ alignSelf: 'flex-end' }} disabled={!!busy}
                      onClick={() => act('close', () => api.setPhase('closed'), 'ההגשה נסגרה')}>■ סגור הגשה</button>
                  </>
                )}
                {phase === 'open' && <M style={{ fontSize: 34, fontWeight: 700, alignSelf: 'flex-end' }}>{countdown(left)}</M>}
              </div>
              <div className="kpis">
                <Kpi value={subs.filter((s) => s.list.length).length} sub={`/${rosterIds.size}`} label="הגישו העדפות" />
                <Kpi value={subs.length ? (subs.reduce((a, s) => a + s.list.length, 0) / subs.length).toFixed(1) : '0'} label="בחירות בממוצע" tone="ghost" size="sm" />
                <Kpi value={mutualCount} label="התאמות הדדיות" tone="mag" size="sm" />
              </div>
              {requested.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>הכי מבוקשים</div>
                  <div className="chips">
                    {requested.map(([id, c]) => <span key={id} className="tag">{byId[id]?.name || id} <M>×{c.n}</M>{c.top ? <M> · #1×{c.top}</M> : null}</span>)}
                  </div>
                </div>
              )}
              {(phase === 'open' || phase === 'closed') && notSubmitted.length > 0 && (
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>עוד לא הגישו ({notSubmitted.length})</summary>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {notSubmitted.map((p) => <span key={p.id} className="tag">{p.name} <SideTag side={p.side} /></span>)}
                  </div>
                </details>
              )}
            </div>
          </Card>

          <Card num="4" title="שיבוץ לפי ההעדפות" en="Match">
            <div className="row">
              <button className="btn btn-lime btn-lg" disabled={!subs.length}
                onClick={() => { const n = mergePrefs(); notify(`נטענו העדפות של ${n} משתתפים`); setPendingRun(true); }}>
                ⇣ משוך העדפות והרץ שיבוץ
              </button>
              <button className="btn" disabled={!subs.length} onClick={() => { const n = mergePrefs(); notify(`נטענו העדפות של ${n} משתתפים – אפשר לכוונן משקלים לפני ההרצה`); setTab('engine'); }}>
                משוך בלבד (לכיוונון משקלים)
              </button>
            </div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>
              ההעדפות מחליפות את ההעדפות הקיימות של מי שהגיש, לפי הסדר: מס׳ 1 = עדיפות גבוהה. מומלץ לעדכן צ׳ק-אין לפני ההרצה, ולבדוק את הלוח בלשונית <M>05</M>.
            </p>
          </Card>

          <Card num="5" title="פרסום הלו״ז למשתתפים" en="Publish">
            <LivePublishBar publishLive={async () => { const ok = await publishLive(); refresh(); return ok; }} openQr={openQr} boardDirty={boardChanged} cloud={cloud} meetings={meetings} />
            {published && <p className="small" style={{ margin: '8px 0 0' }}>בענן: פורסם {fmt(published.publishedAt)} · <M>{published.count}</M> פגישות</p>}
            {boardChanged && <div style={{ marginTop: 10 }}><Alert tone="warn" icon="!" title="הלוח השתנה מאז הפרסום – לחצו ״פרסם שוב״ כדי שהמשתתפים יראו את הגרסה העדכנית." /></div>}
            {!meetings.length && <p className="small muted" style={{ margin: '10px 0 0' }}>עדיין אין לוח שיבוץ.</p>}
          </Card>

          <Card num="⟲" title="גיבוי מצב הצוות בענן" en="Backup">
            <div className="row">
              <button className="btn" onClick={() => act('save', () => api.saveStaff(snapshot()), 'המצב נשמר בענן ✓')}>שמור גיבוי בענן</button>
              <button className="btn" onClick={async () => {
                const r = await act('load', () => api.loadStaff());
                if (!r?.state) { if (r) notify('אין גיבוי בענן', 'err'); return; }
                if (window.confirm(`לטעון את הגיבוי מ-${fmt(r.savedAt)}? הנתונים במחשב הזה יוחלפו.`)) { restore(r.state); notify('הגיבוי נטען'); }
              }}>טען גיבוי מהענן</button>
              <button className="btn btn-danger" onClick={() => window.confirm('לאפס את ההעדפות, ה-Pitch והלו״ז שפורסם בענן? (הרשימה והקישורים נשארים)') && act('reset', () => api.reset(), 'הנתונים בענן אופסו')}>איפוס ערב בענן</button>
            </div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>הגיבוי כולל משתתפים, הגדרות, משקלים, אילוצים ולוח – ומאפשר להמשיך ממחשב צוות אחר.</p>
          </Card>
        </>
      )}
    </div>
  );
}
