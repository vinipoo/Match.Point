import { useMemo, useState } from 'react';
import { Card, M, SideTag, Reason, Modal, Empty } from '../components/ui';
import { explain } from '../engine/scoring';
import { roundTime, roundEnd } from '../engine/scheduler';
import { EVENT } from '../lib/constants';
import { participantLink } from '../lib/cloud';
import LivePublishBar from '../components/LivePublishBar';
import { exportSchedules, exportMaster, whatsappText, waLink, copyText, personalSchedule } from '../lib/io';

const pad = (n) => String(n).padStart(2, '0');

export default function ExportTab(props) {
  const { participants, byId, settings, meetings, scores, active, notify, setTab, stats, cloud, publishLive, openQr, boardDirty } = props;
  const linkOf = (id) => participantLink(cloud?.tokens?.[id]);
  const [wa, setWa] = useState(null);
  const [q, setQ] = useState('');
  const activeSet = useMemo(() => new Set(active), [active]);
  const people = participants.filter((p) => activeSet.has(p.id) && (!q.trim() || p.name.includes(q.trim())));
  const args = { participants, meetings, byId, settings, active, scores, explainFn: explain };

  if (!meetings.length) {
    return <Empty title="אין שיבוץ לייצוא">הריצו שיבוץ בלשונית <M>04</M> או <M>05</M>.<br /><button className="btn btn-lime" style={{ marginTop: 12 }} onClick={() => setTab('engine')}>למנוע השיבוץ</button></Empty>;
  }

  const copy = async (text) => notify((await copyText(text)) ? 'ההודעה הועתקה ✓' : 'ההעתקה נכשלה – סמנו והעתיקו ידנית', 'ok');

  return (
    <div className="stack">
      <div className="no-print">
        <Card num="06.A" title="ייצוא והפצה" en="Export">
          <div style={{ marginBottom: 14 }}>
            <LivePublishBar publishLive={publishLive} openQr={openQr} boardDirty={boardDirty} cloud={cloud} meetings={meetings} />
          </div>
          <div className="row">
            <button className="btn btn-lime btn-lg" onClick={() => window.print()}>⎙ הדפסה / שמירה כ-<M>PDF</M> (דף צוות)</button>
            <button className="btn btn-dark" onClick={() => exportSchedules({ ...args, format: 'xlsx' })}>לו"זים אישיים <M>XLSX</M></button>
            <button className="btn" onClick={() => exportSchedules({ ...args, format: 'csv' })}>לו"זים אישיים <M>CSV</M></button>
            <button className="btn" onClick={() => exportMaster({ ...args, format: 'xlsx' })}><M>Master Matrix XLSX</M></button>
            <button className="btn" onClick={() => exportMaster({ ...args, format: 'csv' })}><M>Master Matrix CSV</M></button>
          </div>
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            קובץ ה-<M>XLSX</M> כולל 3 גיליונות: לו"ז אישי לכל משתתף (שורה לאדם, עמודה לכל סבב עם שעה, שולחן, שותף/ה ותקציר פרופיל), <M>Master Matrix</M>, והודעות <M>WhatsApp</M> מוכנות.
          </p>
        </Card>
      </div>

      <div className="no-print">
        <Card num="05.B" title="לו״זים אישיים והודעות WhatsApp" en={`${people.length} participants`} flush
          actions={<input className="input" style={{ width: 200 }} placeholder="חיפוש…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>שם</th><th>טלפון</th><th>פגישות</th>{Array.from({ length: settings.rounds }, (_, i) => <th key={i}><M>R{pad(i + 1)}</M></th>)}<th /></tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const slots = personalSchedule(p, meetings, byId, settings);
                  return (
                    <tr key={p.id}>
                      <td className="nowrap" style={{ fontWeight: 600 }}>{p.name} <SideTag side={p.side} /></td>
                      <td className="mono small">{p.phone}</td>
                      <td className="num">{stats.count[p.id] || 0}</td>
                      {slots.map((s) => (
                        <td key={s.round} className="small nowrap">
                          {s.partner ? <><M style={{ fontWeight: 700 }}>T{pad(s.table)}</M> {s.partners.map((x) => x.name.split(' ')[0]).join('+')}</> : <span className="muted">—</span>}
                        </td>
                      ))}
                      <td className="nowrap">
                        <button className="btn btn-xs btn-lime" onClick={() => setWa(p)}>הודעה <M>WA</M></button>{' '}
                        <button className="btn btn-xs" onClick={() => copy(whatsappText(p, meetings, byId, settings, linkOf(p.id)))}>העתק</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Master Matrix – on screen + print */}
      <Card num="05.C" title="תצוגת צוות – Master Matrix" en="Staff Sheet">
        <div className="print-only print-head">
          <div>
            <div className="mono small">{EVENT.venueEn} / {EVENT.venueHe}</div>
            <h1>{EVENT.titleHe} <M>{EVENT.titleEn}</M> | <M className="brand">{EVENT.brand}</M></h1>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div className="mono" style={{ fontWeight: 700 }}>{EVENT.date} | {settings.doorsTime}</div>
            <div>{EVENT.address}</div>
            <div className="mono small">{meetings.length} meetings · printed {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
        {Array.from({ length: settings.rounds }, (_, i) => {
          const r = i + 1;
          const ms = meetings.filter((m) => m.round === r).sort((a, b) => a.table - b.table);
          const busy = new Set(ms.flatMap((m) => [m.a, m.b, m.c].filter(Boolean)));
          const free = participants.filter((p) => activeSet.has(p.id) && !busy.has(p.id));
          return (
            <div key={r} className="print-round" style={{ marginBottom: 18 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="tag tag-lime" style={{ fontSize: 14 }}>סבב <M>{pad(r)}</M></span>
                <M style={{ fontWeight: 700 }}>{roundTime(settings, r)}–{roundEnd(settings, r)}</M>
                <span className="muted small">{ms.length} שולחנות פעילים</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th style={{ width: 70 }}>שולחן</th><th>משתתף/ת א'</th><th>משתתף/ת ב'</th><th>ציון וסיבת שיבוץ</th></tr></thead>
                  <tbody>
                    {ms.map((m) => (
                      <tr key={m.id}>
                        <td className="num" style={{ fontSize: 16 }}>{pad(m.table)}</td>
                        <td><b>{byId[m.a]?.name}</b> <span className="small muted">{byId[m.a]?.phone}</span></td>
                        <td><b>{byId[m.b]?.name}</b> <span className="small muted">{byId[m.b]?.phone}</span>{m.c && <><br /><b>+ {byId[m.c]?.name}</b> <span className="small muted">{byId[m.c]?.phone}</span></>}</td>
                        <td><Reason x={explain(m, scores)} locked={m.locked && m.source === 'auto'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {free.length > 0 && (
                <div className="small" style={{ marginTop: 4 }}>
                  <b>נטוורקינג חופשי:</b> {free.map((p) => p.name).join(' · ')}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {wa && (() => {
        const text = whatsappText(wa, meetings, byId, settings, linkOf(wa.id));
        return (
          <Modal title={`הודעת WhatsApp · ${wa.name}`} onClose={() => setWa(null)}
            footer={
              <>
                <button className="btn btn-lime" onClick={() => copy(text)}>העתק הודעה</button>
                <a className="btn btn-dark" href={waLink(wa.phone, text)} target="_blank" rel="noreferrer">פתח ב-<M>WhatsApp</M> ↗</a>
                <button className="btn" onClick={() => setWa(null)}>סגור</button>
              </>
            }>
            <div className="wa-preview">{text}</div>
          </Modal>
        );
      })()}
    </div>
  );
}
