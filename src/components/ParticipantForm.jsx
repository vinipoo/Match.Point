import { useState } from 'react';
import { Modal, M, Toggle } from './ui';
import { SIDES, STATUSES, STAGES, VENTURE, AVAIL } from '../lib/constants';

const toList = (s) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);

export default function ParticipantForm({ initial, participants, onSave, onClose }) {
  const [p, setP] = useState(() => ({
    ...initial,
    idea: initial.idea || '',
    skillsTxt: (initial.skills || []).join('; '),
    seekTxt: (initial.seekSkills || []).join('; '),
    indTxt: (initial.industry || []).join('; '),
  }));
  const [pick, setPick] = useState('');
  const [rank, setRank] = useState('');
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const others = participants.filter((o) => o.id !== p.id && !(p.prefs || []).some((x) => x.id === o.id));
  const nameOf = (id) => participants.find((o) => o.id === id)?.name || id;

  const save = () => {
    if (!p.name.trim()) return;
    const { skillsTxt, seekTxt, indTxt, ...rest } = p;
    onSave({ ...rest, name: p.name.trim(), skills: toList(skillsTxt), seekSkills: toList(seekTxt), industry: toList(indTxt) });
  };

  const Sel = ({ label, k, opts }) => (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={p[k]} onChange={(e) => set({ [k]: e.target.value })}>
        {Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{typeof l === 'string' ? l : `${l.he} · ${l.en}`}</option>)}
      </select>
    </label>
  );
  const Txt = ({ label, k, area, mono }) => (
    <label className="field" style={area ? { gridColumn: '1 / -1' } : undefined}>
      <span>{label}</span>
      {area
        ? <textarea className="textarea" value={p[k]} onChange={(e) => set({ [k]: e.target.value })} />
        : <input className={`input ${mono ? 'mono' : ''}`} value={p[k]} onChange={(e) => set({ [k]: e.target.value })} />}
    </label>
  );

  return (
    <Modal
      title={initial._new ? 'הוספת משתתף/ת (כולל מאחרים)' : `עריכת משתתף/ת · ${initial.id}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-lime" onClick={save} disabled={!p.name.trim()}>שמירה</button>
          <button className="btn" onClick={onClose}>ביטול</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="fields wide">
          {Txt({ label: 'שם מלא *', k: 'name' })}
          {Txt({ label: 'טלפון', k: 'phone', mono: true })}
          {Txt({ label: 'אימייל', k: 'email', mono: true })}
          {Sel({ label: 'צד באירוע', k: 'side', opts: SIDES })}
          {Sel({ label: 'סטטוס הגעה', k: 'status', opts: STATUSES })}
          {Sel({ label: 'זמינות / היקף משרה', k: 'availability', opts: AVAIL })}
          {Sel({ label: 'כיוון מיזם', k: 'ventureMode', opts: VENTURE })}
          {Sel({ label: 'שלב המיזם', k: 'stage', opts: STAGES })}
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <Toggle checked={p.openToJoin} onChange={(v) => set({ openToJoin: v })} label="פתוח/ה להצטרף למיזם של אחר/ת" />
            <Toggle checked={p.didPitch} onChange={(v) => set({ didPitch: v, pitchAt: v ? p.pitchAt || Date.now() : null })} label="🎤 הציג/ה Pitch" />
          </div>
          {Txt({ label: 'מיזם / רעיון קיים', k: 'idea', area: true })}
          {Txt({ label: 'מה מביא/ה לשולחן', k: 'brings', area: true })}
          {Txt({ label: 'איזה שותף/ה מחפש/ת', k: 'seeking', area: true })}
          {Txt({ label: 'כישורים (מופרדים ב-;)', k: 'skillsTxt' })}
          {Txt({ label: 'כישורים מבוקשים בשותף', k: 'seekTxt' })}
          {Txt({ label: 'תחום / תעשייה', k: 'indTxt' })}
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>העדפות מפורשות – רוצה לפגוש</div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {(p.prefs || []).length === 0 && <span className="muted small">אין העדפות</span>}
            {(p.prefs || []).map((x) => (
              <span key={x.id} className="tag tag-lime">
                {nameOf(x.id)} {x.rank ? <M>#{x.rank}</M> : <M>=</M>}
                <button className="btn-xs" style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
                  onClick={() => set({ prefs: p.prefs.filter((y) => y.id !== x.id) })} aria-label="הסר">✕</button>
              </span>
            ))}
          </div>
          <div className="row">
            <select className="select" style={{ width: 'auto', minWidth: 200 }} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">בחר/י משתתף/ת…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name} · {SIDES[o.side]?.en}</option>)}
            </select>
            <select className="select mono" style={{ width: 'auto' }} value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="">ללא דירוג (=)</option>
              {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>#{r}</option>)}
            </select>
            <button className="btn btn-sm" disabled={!pick}
              onClick={() => { set({ prefs: [...(p.prefs || []), { id: pick, rank: rank ? Number(rank) : null }] }); setPick(''); setRank(''); }}>
              הוסף העדפה
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
