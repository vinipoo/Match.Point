import { useMemo, useState } from 'react';
import { Card, Kpi, M, SideTag, Toggle, Alert, Empty } from '../components/ui';
import ParticipantForm from '../components/ParticipantForm';
import { SIDES, STATUSES, VENTURE, AVAIL, STAGES } from '../lib/constants';

const blank = (id) => ({
  _new: true, id, name: '', email: '', phone: '', side: 'tech', status: 'checked_in', brings: '', seeking: '', idea: '',
  skills: [], seekSkills: [], industry: [], stage: 'none', ventureMode: 'flex', openToJoin: true, availability: 'part', prefs: [],
});

export default function ParticipantsTab(props) {
  const { participants, setParticipants, setMeetings, setConstraints, settings, setSettings, stats, active, gaps, broken, run, setTab, notify } = props;
  const [q, setQ] = useState('');
  const [side, setSide] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null);

  const counts = useMemo(() => {
    const c = { checked_in: 0, confirmed: 0, no_show: 0, pending: 0 };
    participants.forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [participants]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return participants.filter((p) =>
      (side === 'all' || p.side === side) &&
      (status === 'all' || p.status === status) &&
      (!t || [p.name, p.id, p.brings, p.idea, p.email, p.phone, ...(p.skills || [])].join(' ').toLowerCase().includes(t)));
  }, [participants, q, side, status]);

  const nameOf = (id) => participants.find((p) => p.id === id)?.name || id;
  const setStatusOf = (id, st) => setParticipants((ps) => ps.map((p) => (p.id === id ? { ...p, status: st } : p)));

  const bulk = (from, to, msg) => {
    const n = participants.filter((p) => p.status === from).length;
    if (!n) return;
    if (!window.confirm(`${msg} (${n} משתתפים)?`)) return;
    setParticipants((ps) => ps.map((p) => (p.status === from ? { ...p, status: to } : p)));
    notify(`עודכנו ${n} משתתפים`);
  };

  const save = (p) => {
    const { _new, ...clean } = p;
    setParticipants((ps) => (_new ? [...ps, clean] : ps.map((x) => (x.id === clean.id ? clean : x))));
    setEditing(null);
    notify(_new ? `${clean.name} נוסף/ה` : 'נשמר');
  };

  const remove = (p) => {
    if (!window.confirm(`למחוק את ${p.name}? הפגישות וההעדפות שלו/ה יוסרו.`)) return;
    setParticipants((ps) => ps.filter((x) => x.id !== p.id).map((x) => ({ ...x, prefs: (x.prefs || []).filter((y) => y.id !== p.id) })));
    setMeetings((ms) => ms.filter((m) => m.a !== p.id && m.b !== p.id));
    setConstraints((c) => ({ must: c.must.filter((x) => !x.includes(p.id)), exclude: c.exclude.filter((x) => !x.includes(p.id)) }));
  };

  const nextId = () => {
    let n = participants.length + 1;
    const ids = new Set(participants.map((p) => p.id));
    while (ids.has(`P${String(n).padStart(2, '0')}`)) n++;
    return `P${String(n).padStart(2, '0')}`;
  };

  if (!participants.length) {
    return <Empty title="אין משתתפים עדיין">טענו קובץ או נתוני דמו בלשונית <M>01</M>.<br /><button className="btn btn-lime" style={{ marginTop: 12 }} onClick={() => setTab('setup')}>לטעינת נתונים</button></Empty>;
  }

  return (
    <div className="stack">
      <div className="grid-2">
        <Card num="02.A" title="מצב הגעה" en="Check-in Live">
          <div className="kpis">
            <Kpi value={counts.checked_in} sub={`/${participants.length}`} label="הגיעו בפועל" />
            <Kpi value={counts.confirmed} label="מאושרים (טרם הגיעו)" tone="ghost" size="sm" />
            <Kpi value={counts.no_show} label="לא הגיעו" tone="mag" size="sm" />
            <Kpi value={counts.pending} label="בהמתנה" tone="ghost" size="sm" />
            <Kpi value={active.length} label="פעילים לשיבוץ" tone="dark" size="sm" />
          </div>
        </Card>
        <Card num="02.B" title="מצב ערב האירוע" en="Live Event Mode">
          <Toggle checked={settings.liveMode} onChange={(v) => setSettings({ liveMode: v })}
            label="מצב LIVE – שבץ רק מי שעשה צ'ק-אין"
            hint="כבוי: משובצים מאושרים + מי שהגיע (טרום אירוע). דלוק: רק Checked-in." />
          <Toggle checked={settings.includePending} onChange={(v) => setSettings({ includePending: v })}
            label="כלול משתתפים בהמתנה" hint="רלוונטי רק כשמצב LIVE כבוי." />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => bulk('confirmed', 'checked_in', 'לסמן את כל המאושרים כהגיעו')}>כל המאושרים ← הגיעו</button>
            <button className="btn btn-sm btn-danger" onClick={() => bulk('confirmed', 'no_show', 'לסמן מאושרים שלא עשו צ׳ק-אין כ-No-show')}>מאושרים שלא הגיעו ← No-show</button>
          </div>
        </Card>
      </div>

      {broken.length > 0 && (
        <Alert tone="warn" icon={broken.length} title={`${broken.length} פגישות בלוח כוללות משתתף/ת שאינו/ה פעיל/ה`}
          action={<button className="btn btn-mag" onClick={() => { run('preserve'); setTab('board'); }}>הרץ שיבוץ מחדש (שמור קיימות)</button>}>
          בעקבות שינויי צ'ק-אין / ביטולים. שיבוץ מחדש ישמור את כל הפגישות התקינות וישבץ רק את המשבצות שנפתחו ואת המאחרים.
        </Alert>
      )}

      <Card num="02.C" title="רשימת משתתפים" en={`${list.length} / ${participants.length}`} flush
        actions={<button className="btn btn-lime btn-sm" onClick={() => setEditing(blank(nextId()))}>+ הוסף משתתף/ת (מאחר/ת)</button>}>
        <div className="row" style={{ padding: 12, borderBottom: '1.5px solid var(--line)' }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="חיפוש שם / מזהה / כישור…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 'auto' }} value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="all">כל הצדדים</option>
            {Object.entries(SIDES).map(([k, v]) => <option key={k} value={k}>{v.he} · {v.en}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">כל הסטטוסים</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.he} · {v.en}</option>)}
          </select>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>שם</th><th>צד</th><th>סטטוס הגעה</th><th>פרופיל</th><th>כיוון / זמינות</th>
                <th>העדפות</th><th>פגישות</th><th>התאמות טובות</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const isActive = active.includes(p.id);
                return (
                  <tr key={p.id} className={isActive ? '' : 'dim'}>
                    <td className="num">{p.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="small muted mono">{p.phone}</div>
                    </td>
                    <td><SideTag side={p.side} /></td>
                    <td>
                      <div className="seg" role="group" aria-label="סטטוס">
                        {Object.entries(STATUSES).map(([k, v]) => (
                          <button key={k} className={`${k} ${p.status === k ? 'on' : ''}`} onClick={() => setStatusOf(p.id, k)} title={v.en}>{v.he}</button>
                        ))}
                      </div>
                    </td>
                    <td>
                      {p.idea && <div className="trunc small" style={{ fontWeight: 600 }} title={p.idea}>{p.idea}</div>}
                      <div className="trunc small muted" title={p.brings}>{p.brings}</div>
                      <div className="chips" style={{ marginTop: 3 }}>{(p.skills || []).slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}</div>
                    </td>
                    <td className="small">
                      <div>{VENTURE[p.ventureMode]}{p.ventureMode === 'own' && p.stage !== 'none' ? ` · ${STAGES[p.stage]}` : ''}</div>
                      <div className="muted">{AVAIL[p.availability]}</div>
                    </td>
                    <td>
                      <div className="chips">
                        {(p.prefs || []).map((x) => {
                          const other = participants.find((o) => o.id === x.id);
                          const mutual = other?.prefs?.some((y) => y.id === p.id);
                          return (
                            <span key={x.id} className={`tag ${mutual ? 'tag-mag' : ''}`} title={mutual ? 'בחירה הדדית – Mutual Match' : ''}>
                              {nameOf(x.id).split(' ')[0]}{x.rank ? <M>#{x.rank}</M> : null}{mutual ? ' ⇄' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="num">{isActive ? (stats.count[p.id] || 0) : '—'}</td>
                    <td className="num">{isActive ? (gaps.options[p.id] ?? 0) : '—'}</td>
                    <td className="nowrap">
                      <button className="btn btn-xs" onClick={() => setEditing(p)}>עריכה</button>{' '}
                      <button className="btn btn-xs btn-danger" onClick={() => remove(p)} aria-label={`מחק ${p.name}`}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <ParticipantForm initial={editing} participants={participants} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

