import { useMemo, useState } from 'react';
import { Card, M, SideTag, Reason, Alert, Empty } from '../components/ui';
import { explain, pairKey, BLOCK_REASONS } from '../engine/scoring';
import { roundTime, roundEnd } from '../engine/scheduler';

const pad = (n) => String(n).padStart(2, '0');
let seq = 0;
const mid = () => `mm${Date.now().toString(36)}${(seq++).toString(36)}`;

function TableCard({ m, byId, scores, settings, activeSet, onLock, onCancel, onTable, past }) {
  const A = byId[m.a];
  const B = byId[m.b];
  const x = explain(m, scores);
  const broken = !activeSet.has(m.a) || !activeSet.has(m.b);
  return (
    <div className={`tcard ${m.locked ? 'locked' : ''} ${x.kind === 'mutual' ? 'mutual' : ''}`} style={broken ? { borderColor: 'var(--mag)', borderStyle: 'dashed' } : undefined}>
      <div className="tcard-h">
        <div className="tno"><small>שולחן</small>{pad(m.table)}</div>
        <div className="acts">
          <select className="mini-select" value={m.table} onChange={(e) => onTable(m, Number(e.target.value))} aria-label="החלף שולחן" title="החלף שולחן">
            {Array.from({ length: settings.tables }, (_, i) => <option key={i} value={i + 1}>T{pad(i + 1)}</option>)}
          </select>
          <button className={`btn btn-xs ${m.locked ? 'btn-dark' : ''}`} onClick={() => onLock(m)} title={m.locked ? 'שחרר נעילה' : 'נעל פגישה'}>
            {m.locked ? 'נעול' : 'נעל'}
          </button>
          <button className="btn btn-xs btn-danger" onClick={() => onCancel(m)} title="בטל פגישה" aria-label="בטל פגישה">✕</button>
        </div>
      </div>
      <div className="tcard-b">
        {[A, B].map((p, i) => (
          <div key={i}>
            {i === 1 && <div className="vs">VS</div>}
            <div className="person">
              <div className="nm">
                {p?.name || '—'} {p && <SideTag side={p.side} />}
                {p && !activeSet.has(p.id) && <span className="tag tag-mag">לא פעיל</span>}
              </div>
              <div className="pr trunc" title={p?.idea || p?.brings}>{p?.idea || p?.brings}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="tcard-f">
        <Reason x={x} locked={m.locked && m.source !== 'must' && m.source !== 'manual'} />
        {past && <M className="small muted">DONE</M>}
      </div>
    </div>
  );
}

export default function BoardTab(props) {
  const { participants, byId, settings, setSettings, meetings, setMeetings, scores, active, run, addConstraint, notify, broken, setTab } = props;
  const [round, setRound] = useState(Math.min(settings.currentRound || 1, settings.rounds));
  const [view, setView] = useState('tables');
  const [pa, setPa] = useState('');
  const [pb, setPb] = useState('');
  const activeSet = useMemo(() => new Set(active), [active]);
  const R = settings.rounds;
  const r = Math.min(round, R);

  const inRound = useMemo(() => meetings.filter((m) => m.round === r).sort((a, b) => a.table - b.table), [meetings, r]);
  const busy = new Set(inRound.flatMap((m) => [m.a, m.b]));
  const free = participants.filter((p) => activeSet.has(p.id) && !busy.has(p.id));

  const patch = (id, fn) => setMeetings((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  const onLock = (m) => patch(m.id, (x) => ({ ...x, locked: !x.locked }));
  const onCancel = (m) => {
    const choice = window.confirm(`לבטל את הפגישה ${byId[m.a]?.name} ↔ ${byId[m.b]?.name}?\nהזוג יוחרג כדי שלא ישובץ שוב בשיבוץ הבא.`);
    if (!choice) return;
    setMeetings((ms) => ms.filter((x) => x.id !== m.id));
    addConstraint('exclude', m.a, m.b);
    notify('הפגישה בוטלה – הריצו "שיבוץ מחדש (שמור קיימות)" למילוי המשבצת');
  };
  const onTable = (m, t) => {
    setMeetings((ms) => {
      const other = ms.find((x) => x.round === m.round && x.table === t && x.id !== m.id);
      return ms.map((x) => (x.id === m.id ? { ...x, table: t } : other && x.id === other.id ? { ...x, table: m.table } : x));
    });
  };
  const addManual = () => {
    if (!pa || !pb || pa === pb) return;
    const met = meetings.some((m) => pairKey(m.a, m.b) === pairKey(pa, pb));
    if (met && !window.confirm('הזוג כבר נפגש בסבב אחר. לשבץ שוב?')) return;
    const used = new Set(inRound.map((m) => m.table));
    let t = 1;
    while (used.has(t) && t <= settings.tables) t++;
    if (t > settings.tables) { notify('אין שולחן פנוי בסבב זה', 'err'); return; }
    const e = scores.get(pairKey(pa, pb));
    setMeetings((ms) => [...ms, { id: mid(), round: r, table: t, a: pa, b: pb, score: e?.score ?? 0, locked: true, source: 'manual' }]);
    setPa(''); setPb('');
    notify(`נוצרה פגישה ידנית בשולחן ${t}`);
  };

  if (!meetings.length) {
    return (
      <Empty title="הלוח ריק">
        עדיין לא הורץ שיבוץ.
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn btn-lime btn-lg" disabled={active.length < 2} onClick={() => run('fresh')}>▶ הרץ שיבוץ</button>
          <button className="btn" onClick={() => setTab('engine')}>למשקלים והגדרות</button>
        </div>
      </Empty>
    );
  }

  const pairScore = pa && pb && pa !== pb ? scores.get(pairKey(pa, pb)) : null;

  return (
    <div className="stack">
      <div className="row between">
        <div className="round-chips" role="tablist" aria-label="סבבים">
          {Array.from({ length: R }, (_, i) => {
            const n = i + 1;
            const c = meetings.filter((m) => m.round === n).length;
            return (
              <button key={n} className={`round-chip ${n === r && view === 'tables' ? 'active' : ''} ${n < settings.currentRound ? 'past' : ''}`}
                onClick={() => { setRound(n); setView('tables'); }}>
                <span className="r">{pad(n)}</span>
                <span className="t">{roundTime(settings, n)} · {c}T</span>
                {n === settings.currentRound && <span className="now">NOW</span>}
              </button>
            );
          })}
          <button className={`round-chip ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>
            <span className="r">∑</span><span className="t">לפי משתתף</span>
          </button>
        </div>
        <div className="row">
          <button className="btn btn-lime" onClick={() => run('fresh')}>▶ הרץ שיבוץ</button>
          <button className="btn btn-mag" onClick={() => run('preserve')}>↻ שיבוץ מחדש (שמור קיימות)</button>
        </div>
      </div>

      {broken.length > 0 && (
        <Alert tone="warn" icon={broken.length} title="פגישות עם משתתפים שאינם פעילים (No-show / ביטול)"
          action={<button className="btn btn-mag btn-sm" onClick={() => run('preserve')}>תקן עכשיו</button>}>
          מסומנות במסגרת מקווקוות. שיבוץ מחדש ישבץ את השותפים שנותרו לבד עם משתתפים פנויים.
        </Alert>
      )}

      {view === 'tables' ? (
        <>
          <Card num={`R${pad(r)}`} title={`סבב ${r}`} en={`${roundTime(settings, r)}–${roundEnd(settings, r)} · ${inRound.length}/${settings.tables} tables`}
            actions={
              <button className={`btn btn-sm ${r === settings.currentRound ? 'btn-mag' : ''}`} onClick={() => setSettings({ currentRound: r })}>
                {r === settings.currentRound ? 'הסבב הנוכחי (LIVE)' : 'סמן כסבב נוכחי'}
              </button>
            }>
            {inRound.length === 0 ? <div className="muted">אין פגישות בסבב זה – כולם בנטוורקינג חופשי.</div> : (
              <div className="grid-auto">
                {inRound.map((m) => (
                  <TableCard key={m.id} m={m} byId={byId} scores={scores} settings={settings} activeSet={activeSet}
                    onLock={onLock} onCancel={onCancel} onTable={onTable} past={r < settings.currentRound} />
                ))}
              </div>
            )}
          </Card>

          <Card num="FREE" title="זמן נטוורקינג חופשי בסבב זה" en={`${free.length} participants`}>
            <div className="chips" style={{ marginBottom: 12 }}>
              {free.length === 0 && <span className="muted small">כל המשתתפים הפעילים משובצים בסבב זה.</span>}
              {free.map((p) => <span key={p.id} className="tag">{p.name} <SideTag side={p.side} /></span>)}
            </div>
            {free.length >= 2 && (
              <div className="row">
                <span style={{ fontWeight: 600 }}>שיבוץ ידני:</span>
                {[[pa, setPa], [pb, setPb]].map(([v, set], i) => (
                  <select key={i} className="select" style={{ width: 'auto', minWidth: 150 }} value={v} onChange={(e) => set(e.target.value)}>
                    <option value="">{i ? "משתתף/ת ב'" : "משתתף/ת א'"}</option>
                    {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ))}
                {pairScore && (
                  <span className={`tag ${pairScore.blocked ? 'tag-outline-mag' : ''}`}>
                    <M>{pairScore.score}%</M>{pairScore.blocked ? ` · ${BLOCK_REASONS[pairScore.blocked]}` : ''}
                  </span>
                )}
                <button className="btn btn-sm btn-lime" disabled={!pa || !pb || pa === pb} onClick={addManual}>צור פגישה נעולה</button>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card num="∑" title="מטריצת משתתפים × סבבים" en="Participant Grid" flush>
          <div className="tbl-wrap">
            <table className="tbl grid-matrix">
              <thead>
                <tr>
                  <th>משתתף/ת</th><th>#</th>
                  {Array.from({ length: R }, (_, i) => <th key={i}>סבב <M>{pad(i + 1)}</M> · <M>{roundTime(settings, i + 1)}</M></th>)}
                </tr>
              </thead>
              <tbody>
                {participants.filter((p) => activeSet.has(p.id)).map((p) => {
                  const mine = meetings.filter((m) => m.a === p.id || m.b === p.id);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }} className="nowrap">{p.name} <SideTag side={p.side} /></td>
                      <td className="num">{mine.length}</td>
                      {Array.from({ length: R }, (_, i) => {
                        const m = mine.find((x) => x.round === i + 1);
                        if (!m) return <td key={i} className="slot free">נטוורקינג</td>;
                        const other = byId[m.a === p.id ? m.b : m.a];
                        const x = explain(m, scores);
                        return (
                          <td key={i} className="slot" title={`${x.label} // ${x.score}%`}>
                            <span className="tb">{pad(m.table)}</span>{other?.name}
                            {x.kind === 'mutual' && <span style={{ color: 'var(--mag)', fontWeight: 700 }}> ⇄</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
