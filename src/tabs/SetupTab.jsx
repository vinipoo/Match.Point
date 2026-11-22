import { useRef, useState } from 'react';
import { Card, NumField, M, Alert } from '../components/ui';
import GapPanel from '../components/GapPanel';
import { DEMO_PARTICIPANTS, DEMO_CONSTRAINTS } from '../data/demo';
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from '../lib/constants';
import { readFile, mapRows, downloadTemplate, exportParticipants } from '../lib/io';
import { roundTime, roundEnd } from '../engine/scheduler';

export default function SetupTab(props) {
  const { participants, setParticipants, constraints, setConstraints, setMeetings, settings, setSettings, setWeights, setLastRun, gaps, notify, setTab } = props;
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);
  const [report, setReport] = useState(null);

  const replaceData = (ps, cons, label) => {
    if (participants.length && !window.confirm(`פעולה זו תחליף ${participants.length} משתתפים קיימים ותנקה את לוח השיבוץ. להמשיך?`)) return false;
    setParticipants(ps);
    setConstraints(cons);
    setMeetings([]);
    setLastRun(null);
    notify(`${label}: נטענו ${ps.length} משתתפים`);
    return true;
  };

  const loadDemo = () => {
    if (replaceData(structuredClone(DEMO_PARTICIPANTS), structuredClone(DEMO_CONSTRAINTS), 'נתוני דמו')) {
      setReport({ name: 'נתוני דמו', count: DEMO_PARTICIPANTS.length, warnings: [], must: 1, exclude: 1 });
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const rows = await readFile(file);
      const res = mapRows(rows);
      if (!res.participants.length) { notify('לא נמצאו משתתפים בקובץ – בדקו את שמות העמודות', 'err'); return; }
      if (replaceData(res.participants, res.constraints, file.name)) {
        setReport({ name: file.name, count: res.participants.length, warnings: res.warnings, must: res.constraints.must.length, exclude: res.constraints.exclude.length });
      }
    } catch (e) {
      notify(`שגיאה בקריאת הקובץ: ${e.message}`, 'err');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resetAll = () => {
    if (!window.confirm('לאפס את כל המערכת (משתתפים, הגדרות, משקלים ושיבוץ)?')) return;
    setParticipants([]); setConstraints({ must: [], exclude: [] }); setMeetings([]); setLastRun(null);
    setSettings(DEFAULT_SETTINGS); setWeights(DEFAULT_WEIGHTS); setReport(null);
    notify('המערכת אופסה');
  };

  const R = Number(settings.rounds);
  const endTime = roundEnd(settings, R);

  return (
    <div className="stack">
      <div className="grid-2">
        <Card num="01.A" title="טעינת נתונים" en="Import CSV / Excel">
          <div className="stack" style={{ gap: 14 }}>
            <div className="row">
              <button className="btn btn-lime btn-lg" onClick={loadDemo}>טען נתוני דמו (<M>24</M> משתתפים)</button>
            </div>
            <div
              className={`dropzone ${over ? 'over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            >
              <div className="serif" style={{ fontSize: 18 }}>גררו לכאן קובץ או לחצו לבחירה</div>
              <div className="small muted"><M>.csv · .xlsx · .xls</M> — כותרות בעברית או באנגלית</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
            <div className="row">
              <button className="btn btn-sm btn-lime" onClick={downloadTemplate}>הורד תבנית <M>Excel</M> לדוגמה</button>
              <button className="btn btn-sm" disabled={!participants.length} onClick={() => exportParticipants(participants, constraints)}>
                גיבוי משתתפים <M>XLSX</M>
              </button>
              <button className="btn btn-sm btn-danger" onClick={resetAll}>איפוס מלא</button>
            </div>
            {report && (
              <Alert tone={report.warnings.length ? 'warn' : 'ok'} icon={report.warnings.length ? '!' : '✓'}
                title={`${report.name}: ${report.count} משתתפים · ${report.must} נעולים · ${report.exclude} החרגות`}>
                {report.warnings.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 18, maxHeight: 120, overflow: 'auto' }}>
                    {report.warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </Alert>
            )}
            <details className="small">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>מבנה עמודות נתמך</summary>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                <M>id, name, email, phone, side (tech/business/both), status (confirmed/checked-in/no-show/pending), did_pitch (yes/no), brings, seeking, idea,
                skills, seek_skills, industry, stage (idea/mvp/growth/none), venture_mode (own/join/new/flex), open_to_join (yes/no),
                availability (full/part/evenings), preferences (P03:1; P07:2), must_match, exclude</M>
                <br />רשימות מופרדות ב-<M>;</M> · העדפות לפי מזהה או שם מלא, עם דירוג אופציונלי <M>1-5</M>.
              </p>
            </details>
          </div>
        </Card>

        <Card num="01.B" title="הגדרות אירוע וסבבים" en="Event Settings">
          <div className="stack" style={{ gap: 14 }}>
            <div className="fields">
              <NumField label="מספר סבבים" value={settings.rounds} min={1} max={20} onChange={(v) => setSettings({ rounds: v })} />
              <NumField label="שולחנות זמינים" value={settings.tables} min={1} max={200} onChange={(v) => setSettings({ tables: v })} />
              <NumField label="משך סבב (דק׳)" value={settings.roundMin} min={3} max={60} onChange={(v) => setSettings({ roundMin: v })} />
              <NumField label="זמן מעבר (דק׳)" value={settings.transitionMin} min={0} max={15} onChange={(v) => setSettings({ transitionMin: v })} />
              <label className="field">
                <span>התכנסות</span>
                <input className="input mono" type="time" value={settings.doorsTime} onChange={(e) => setSettings({ doorsTime: e.target.value })} />
              </label>
              <label className="field">
                <span>תחילת סבב 1</span>
                <input className="input mono" type="time" value={settings.startTime} onChange={(e) => setSettings({ startTime: e.target.value })} />
              </label>
            </div>
            <div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>לוח זמנים</div>
              <div className="timeline">
                <div><div className="k">התכנסות</div><div className="v">{settings.doorsTime}</div></div>
                {Array.from({ length: R }, (_, i) => (
                  <div key={i}><div className="k">סבב <M>{i + 1}</M></div><div className="v">{roundTime(settings, i + 1)}</div></div>
                ))}
                <div><div className="k">סיום</div><div className="v">{endTime}</div></div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <GapPanel gaps={gaps} settings={settings} setSettings={setSettings} num="01.C" />

      {participants.length > 0 && (
        <div className="row">
          <button className="btn btn-dark" onClick={() => setTab('people')}>המשך: משתתפים וצ'ק-אין ←</button>
          <button className="btn" onClick={() => setTab('engine')}>למנוע השיבוץ ←</button>
        </div>
      )}
    </div>
  );
}
