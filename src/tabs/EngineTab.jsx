import { useMemo, useState } from 'react';
import { Card, Kpi, M, SideTag, Toggle, Alert, Empty } from '../components/ui';
import GapPanel from '../components/GapPanel';
import ScheduleHealth from '../components/ScheduleHealth';
import { WEIGHT_LABELS, DEFAULT_WEIGHTS, SIDES } from '../lib/constants';
import { pairKey, BLOCK_REASONS } from '../engine/scoring';

function PairPicker({ participants, onAdd, label, tone }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <div className="row">
      {[[a, setA], [b, setB]].map(([v, set], i) => (
        <select key={i} className="select" style={{ width: 'auto', minWidth: 150 }} value={v} onChange={(e) => set(e.target.value)}>
          <option value="">{i ? "משתתף/ת ב'" : "משתתף/ת א'"}</option>
          {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ))}
      <button className={`btn btn-sm ${tone}`} disabled={!a || !b || a === b} onClick={() => { onAdd(a, b); setA(''); setB(''); }}>{label}</button>
    </div>
  );
}

export default function EngineTab(props) {
  const { participants, byId, settings, setSettings, weights, setWeights, constraints, addConstraint, removeConstraint, scores, gaps, stats, lastRun, run, meetings, setTab, active } = props;
  const [focus, setFocus] = useState('');
  const wsum = Object.values(weights).reduce((s, v) => s + Number(v), 0) || 1;

  const explorer = useMemo(() => {
    if (!focus) return [];
    return participants
      .filter((p) => p.id !== focus)
      .map((p) => ({ p, e: scores.get(pairKey(focus, p.id)) }))
      .filter((x) => x.e)
      .sort((x, y) => (x.e.blocked ? 1 : 0) - (y.e.blocked ? 1 : 0) || y.e.score - x.e.score);
  }, [focus, participants, scores]);

  const metWith = useMemo(() => new Set(meetings.filter((m) => [m.a, m.b, m.c].includes(focus)).flatMap((m) => [m.a, m.b, m.c].filter((id) => id && id !== focus))), [meetings, focus]);

  if (!participants.length) return <Empty title="אין נתונים להרצה">טענו משתתפים בלשונית <M>01</M>.</Empty>;

  return (
    <div className="stack">
      <div className="grid-2">
        <Card num="03.A" title="משקלי נוסחת ההתאמה" en="Scoring Weights"
          actions={<button className="btn btn-sm" onClick={() => setWeights(DEFAULT_WEIGHTS)}>ברירת מחדל <M>45/25/15/10/5</M></button>}>
          {Object.entries(WEIGHT_LABELS).map(([k, l]) => (
            <div key={k} className="slider-row">
              <div className="lab">{l.he}<M>{l.en}</M></div>
              <input type="range" min={0} max={100} value={weights[k]} onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))} aria-label={l.he} />
              <div className="val">{weights[k]}</div>
              <div className="pct">{Math.round((weights[k] / wsum) * 100)}%</div>
            </div>
          ))}
          <div className="slider-row" style={{ borderTop: '1.5px solid var(--line)', marginTop: 8, paddingTop: 12 }}>
            <div className="lab">סף ציון מינימלי<M>Quality threshold</M></div>
            <input type="range" min={0} max={90} value={settings.threshold} onChange={(e) => setSettings({ threshold: Number(e.target.value) })} aria-label="סף" />
            <div className="val" style={{ background: 'var(--lime)', color: 'var(--on-accent)' }}>{settings.threshold}</div>
            <div className="pct">/100</div>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            המשקלים מנורמלים אוטומטית ל-<M>100%</M>. כל שינוי מחשב מחדש את הציונים מיד – הריצו שיבוץ כדי להחיל על הלוח.
          </p>
        </Card>

        <Card num="03.B" title="כללים ואילוצים" en="Rules">
          <Toggle checked={settings.enforceVentureRule} onChange={(v) => setSettings({ enforceVentureRule: v })}
            label="סינון מיזם מול מיזם" hint="לא לשבץ שני יזמים עם מיזם קיים כשאף אחד מהם לא מוכן להצטרף למיזם של האחר." />
          <Toggle checked={settings.allowSameSide} onChange={(v) => setSettings({ allowSameSide: v })}
            label="אפשר התאמות משלימות בתוך אותו צד" hint="Tech-Tech / Biz-Biz לפי כישורים משלימים – מומלץ כשיש פער מספרי." />
          <div style={{ padding: '8px 10px', background: 'var(--soft)', borderInlineStart: '4px solid var(--lime)', margin: '6px 0' }}>
            <div style={{ fontWeight: 700 }}>מינימום <M>{settings.minMeetings}</M> פגישות רצופות בתחילת הערב</div>
            <div className="small muted">
              בסבבים <M>1–{Math.min(settings.minMeetings, settings.rounds)}</M> המנוע מנסה לשבץ את כולם בכל סבב: קודם התאמות טובות ובחירות הדדיות,
              ומי שאין לו מספיק – מושלם מול המועמדים עם הציון הגבוה ביותר לפי הטופס והפרופיל (תפקיד, כישורים, שלב מיזם, זמינות ותחום), לא בהגרלה.
              אחר כך משובצות רק התאמות טובות; סבבים בלי פרטנר מתאים מסומנים כנטוורקינג חופשי.
            </div>
          </div>
          <Toggle checked={settings.fairnessFallback} onChange={(v) => setSettings({ fairnessFallback: v })}
            label="בהשלמת המינימום – מותר מאותו צד" hint="כשאין פרטנר פנוי מהצד השני (למשל יותר עסקיים מטכנולוגיים), להשלים מול המועמד הטוב ביותר מאותו צד עם כישורים משלימים." />
          <div style={{ marginTop: 6, padding: '8px 10px', border: '1.5px dashed var(--mag)' }}>
            <Toggle checked={settings.wildcardEnabled} onChange={(v) => setSettings({ wildcardEnabled: v })}
              label={<>סבב הפתעה <M>Wildcard</M></>}
              hint="בסבב שנבחר: זוגות Tech ↔ Business אקראיים (מבין מי שעוד לא נפגשו), בלי קשר לבחירות – כדי לשבור שגרה באמצע הערב." />
            {settings.wildcardEnabled && (
              <div className="row" style={{ marginTop: 4 }}>
                <span className="small" style={{ fontWeight: 600 }}>סבב:</span>
                <div className="seg">
                  {[2, 3].filter((n) => n <= settings.rounds).map((n) => (
                    <button key={n} className={settings.wildcardRound === n ? 'on confirmed' : ''} onClick={() => setSettings({ wildcardRound: n })}><M>{String(n).padStart(2, '0')}</M></button>
                  ))}
                </div>
                <button className="btn btn-sm" onClick={() => setSettings({ wildcardSeed: Math.floor(Math.random() * 1e9) + 1 })} title="הגרלה חדשה של זוגות ה-Wildcard (בהרצה הבאה)">🎲 הגרל מחדש</button>
              </div>
            )}
          </div>
          <div className="fields" style={{ marginTop: 10 }}>
            <label className="field">
              <span>מינימום פגישות רצופות בהתחלה</span>
              <select className="select mono" value={settings.minMeetings} onChange={(e) => setSettings({ minMeetings: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </Card>
      </div>

      <Card num="03.C" title="הרצת אלגוריתם השיבוץ" en="Optimizer">
        <div className="stack" style={{ gap: 16 }}>
          <ScheduleHealth active={active} settings={settings} setSettings={setSettings} meetings={meetings} run={run} />
          <div className="row">
            <button className="btn btn-lime btn-lg" onClick={() => { run('fresh'); setTab('board'); }}>▶ הרץ שיבוץ</button>
            <button className="btn btn-mag btn-lg" disabled={!meetings.length} onClick={() => { run('preserve'); setTab('board'); }}>
              ↻ הרץ שיבוץ מחדש (שמור קיימות)
            </button>
            <label className="field" style={{ width: 150 }}>
              <span className="small">סבב נוכחי / שהופץ</span>
              <select className="select mono" value={settings.currentRound} onChange={(e) => setSettings({ currentRound: Number(e.target.value) })}>
                {Array.from({ length: settings.rounds }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
              </select>
            </label>
          </div>
          <div className="small muted">
            <b>הרץ שיבוץ</b> – בונה לוח חדש (שומר רק פגישות שננעלו ידנית ו-Must-match).{' '}
            <b>שיבוץ מחדש</b> – שומר כל פגישה תקינה ששני הצדדים בה פעילים, לא נוגע בסבבים שלפני הסבב הנוכחי, ומשבץ רק משבצות שהתפנו + מאחרים.
          </div>
          {meetings.length > 0 && (
            <div className="kpis">
              <Kpi value={stats.total} label="פגישות בלוח" />
              <Kpi value={`${stats.avg}%`} label="ציון ממוצע" tone="dark" size="sm" />
              <Kpi value={`${stats.mutualMet}/${stats.mutualTotal}`} label="התאמות הדדיות שמומשו" tone="mag" size="sm" />
              <Kpi value={`${stats.min}–${stats.max}`} label="טווח פגישות לאדם" tone="ghost" size="sm" />
              <Kpi value={stats.zero.length} label="ללא פגישות" tone={stats.zero.length ? 'mag' : 'ghost'} size="sm" />
            </div>
          )}
          {lastRun && (
            <div className="small mono muted">
              LAST RUN {new Date(lastRun.at).toLocaleTimeString('he-IL')} · {lastRun.mode} · kept {lastRun.kept} · dropped {lastRun.dropped} · must {lastRun.must} · quality {lastRun.auto} · profile-fill {lastRun.fallback}{lastRun.wildcard ? ` · wildcard ${lastRun.wildcard}` : ''}
            </div>
          )}
          {lastRun?.unplacedMust?.length > 0 && (
            <Alert tone="warn" icon="!" title="פגישות Must-match שלא שובצו">
              {lastRun.unplacedMust.map(([a, b, why]) => `${byId[a]?.name || a} ↔ ${byId[b]?.name || b} (${why})`).join(' · ')}
            </Alert>
          )}
          {meetings.length > 0 && (stats.earlyGap.length === 0 ? (
            <Alert tone="ok" icon="✓" title={`לכל המשתתפים יש ${settings.minMeetings} פגישות רצופות בסבבים 1–${Math.min(settings.minMeetings, settings.rounds)}`}>
              {stats.sameSideFill > 0 ? `${stats.sameSideFill} מהן הושלמו מאותו צד לפי הפרופיל (אין מספיק פרטנרים מהצד השני).` : 'כולן מול הצד המשלים.'}
            </Alert>
          ) : (
            <Alert tone="warn" icon={stats.earlyGap.length} title={`לא קיבלו ${settings.minMeetings} פגישות רצופות בהתחלה`}>
              {stats.earlyGap.map((id) => `${byId[id]?.name} (${stats.count[id] || 0} סה״כ)`).join(' · ')}
              <div style={{ marginTop: 4 }}>
                {gaps.tablesNeeded > settings.tables
                  ? `הסיבה: חסרים שולחנות – צריך לפחות ${gaps.tablesNeeded} כדי לשבץ את כולם בכל סבב (מוגדרים ${settings.tables}).`
                  : gaps.total % 2 ? 'מספר המשתתפים אי-זוגי, כך שבכל סבב אחד נשאר בלי פרטנר – הוא מקבל עדיפות בסבב הבא.'
                  : 'אין מספיק פרטנרים מותרים (החרגות / כלל מיזם מול מיזם / השלמה מאותו צד כבויה).'}
              </div>
            </Alert>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <GapPanel gaps={gaps} settings={settings} setSettings={setSettings} num="03.D" />

        <Card num="03.E" title="פגישות נעולות והחרגות" en="Must-match / Exclude">
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>נעילה מראש <M className="small muted">Must-match</M></div>
              <div className="chips" style={{ marginBottom: 8 }}>
                {constraints.must.length === 0 && <span className="muted small">אין</span>}
                {constraints.must.map(([a, b]) => (
                  <span key={pairKey(a, b)} className="tag tag-lime">
                    {byId[a]?.name} ↔ {byId[b]?.name}
                    <button style={{ border: 0, background: 'transparent', cursor: 'pointer' }} onClick={() => removeConstraint('must', a, b)} aria-label="הסר">✕</button>
                  </span>
                ))}
              </div>
              <PairPicker participants={participants} onAdd={(a, b) => addConstraint('must', a, b)} label="נעל זוג" tone="btn-lime" />
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>החרגה <M className="small muted">Exclude</M></div>
              <div className="chips" style={{ marginBottom: 8 }}>
                {constraints.exclude.length === 0 && <span className="muted small">אין</span>}
                {constraints.exclude.map(([a, b]) => (
                  <span key={pairKey(a, b)} className="tag tag-outline-mag">
                    {byId[a]?.name} ⊘ {byId[b]?.name}
                    <button style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit' }} onClick={() => removeConstraint('exclude', a, b)} aria-label="הסר">✕</button>
                  </span>
                ))}
              </div>
              <PairPicker participants={participants} onAdd={(a, b) => addConstraint('exclude', a, b)} label="החרג זוג" tone="btn-mag" />
            </div>
          </div>
        </Card>
      </div>

      <Card num="03.F" title="סייר התאמות – למה זה הציון?" en="Pair Explorer" flush
        actions={
          <select className="select" style={{ width: 'auto', minWidth: 220 }} value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="">בחרו משתתף/ת…</option>
            {participants.map((p) => <option key={p.id} value={p.id}>{p.name} · {SIDES[p.side]?.en}{active.includes(p.id) ? '' : ' (לא פעיל)'}</option>)}
          </select>
        }>
        {!focus ? (
          <div className="card-b muted">בחרו משתתף/ת כדי לראות את כל השותפים האפשריים מדורגים, עם פירוק הציון לכל רכיב.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>שותף/ה</th><th>צד</th><th>ציון</th>
                  {Object.values(WEIGHT_LABELS).map((l) => <th key={l.en}>{l.he}</th>)}
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {explorer.map(({ p, e }) => (
                  <tr key={p.id} className={e.blocked || !active.includes(p.id) ? 'dim' : ''}>
                    <td style={{ fontWeight: 600 }}>
                      {p.name}{' '}
                      {e.prefKind === 'mutual' && <span className="tag tag-mag">הדדי ⇄</span>}
                      {(e.prefKind === 'a' || e.prefKind === 'b') && <span className="tag tag-lime">{byId[focus]?.prefs?.some((x) => x.id === p.id) ? 'נבחר/ה' : 'בחר/ה בו/ה'}</span>}
                    </td>
                    <td><SideTag side={p.side} /></td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <M style={{ fontWeight: 700, minWidth: 28 }}>{e.score}</M>
                        <div className={`bar ${e.score < settings.threshold ? 'mag' : ''}`}><i style={{ width: `${e.score}%` }} /></div>
                      </div>
                    </td>
                    {Object.keys(WEIGHT_LABELS).map((k) => <td key={k} className="num small">{Math.round(e.comps[k] * 100)}</td>)}
                    <td className="small">
                      {e.blocked
                        ? <span className="tag tag-outline-mag">{BLOCK_REASONS[e.blocked]}</span>
                        : metWith.has(p.id) ? <span className="tag tag-lime">משובץ/ת</span>
                          : e.score >= settings.threshold ? <span className="tag">מעל הסף</span> : <span className="muted">מתחת לסף</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
