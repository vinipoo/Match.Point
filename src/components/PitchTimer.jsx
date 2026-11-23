import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENT, SIDES } from '../lib/constants';
import { M } from './ui';

// Full-screen pitch timer for the venue screen. Staff control everything from this screen:
// start / pause / reset / ±15s / duration, next / previous / skip, jump to anyone, reorder the queue.
const STORE = 'mp-pitch-timer';
const PRESETS = [45, 60, 90, 120, 180];
const DEFAULT_SECONDS = 45;
const durLabel = (s) => (s < 60 ? `${s} שנ׳` : `${s / 60} דק׳`);

// Bell: three loud rings rendered to a WAV in the browser and played through an <audio> element.
// (An audio element also plays when an iPhone is on silent, unlike Web Audio; no file to download.)
function renderBellWav() {
  const sr = 44100;
  const n = Math.floor(sr * 2.4);
  const data = new Float32Array(n);
  const partials = [[880, 1], [1320, 0.5], [1760, 0.28], [2640, 0.14], [3520, 0.06]];
  for (const r0 of [0, 0.6, 1.2]) {
    const start = Math.floor(r0 * sr);
    for (let i = 0; start + i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.005) * Math.exp(-t * 2.6);
      let v = 0;
      for (const [freq, amp] of partials) v += amp * Math.sin(2 * Math.PI * freq * t);
      data[start + i] += v * env;
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const str = (o, x) => { for (let i = 0; i < x.length; i++) dv.setUint8(o + i, x.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (data[i] / peak) * 0.95)) * 32767, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
let bellEl = null;
const getBell = () => {
  if (!bellEl) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
    bellEl = new Audio(renderBellWav());
    bellEl.preload = 'auto';
    bellEl.volume = 1;
  }
  return bellEl;
};
// browsers only allow sound after a user gesture: call this from a click (start / test)
const getAudio = () => {
  try {
    const el = getBell();
    if (el.dataset.unlocked) return el;
    el.muted = true;
    el.play().then(() => { el.pause(); el.currentTime = 0; el.muted = false; el.dataset.unlocked = '1'; }).catch(() => { el.muted = false; });
    return el;
  } catch { return null; }
};
function ringBell() {
  try {
    const el = getBell();
    el.muted = false;
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
  } catch { /* no audio available */ }
}

const fmt = (ms) => {
  const neg = ms < 0;
  const s = Math.ceil(Math.abs(ms) / 1000);
  return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE)) || {};
    return s.v === 2 ? s : { ...s, v: 2, duration: DEFAULT_SECONDS };
  } catch { return {}; }
};

export default function PitchTimer({ participants, pitchedIds, onClose }) {
  const byId = useMemo(() => Object.fromEntries(participants.map((p) => [p.id, p])), [participants]);
  // default queue: presenters marked as arrived, in pitch order
  const arrived = useMemo(() => pitchedIds.filter((id) => byId[id]?.status === 'checked_in'), [pitchedIds, byId]);
  const saved = useMemo(load, []);

  const [queue, setQueue] = useState(() => {
    const keep = (saved.queue || []).filter((id) => arrived.includes(id));
    return [...keep, ...arrived.filter((id) => !keep.includes(id))];
  });
  const [skipped, setSkipped] = useState(() => (saved.skipped || []).filter((id) => byId[id]));
  const [done, setDone] = useState(() => (saved.done || []).filter((id) => byId[id]));
  const [idx, setIdx] = useState(() => Math.min(saved.idx || 0, Math.max(0, (saved.queue || []).length - 1)));
  const [duration, setDuration] = useState(saved.duration || DEFAULT_SECONDS);
  const [sound, setSound] = useState(saved.sound !== false);
  const [autoNext, setAutoNext] = useState(!!saved.autoNext);
  const [showIdea, setShowIdea] = useState(saved.showIdea !== false);
  const [remaining, setRemaining] = useState((saved.duration || DEFAULT_SECONDS) * 1000);
  const [running, setRunning] = useState(false);
  const [controls, setControls] = useState(true);
  const [custom, setCustom] = useState('');
  const [queueOpen, setQueueOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const endAt = useRef(null);
  const rootRef = useRef(null);

  // new presenters marked during the session join the end of the queue
  useEffect(() => {
    setQueue((q) => [...q.filter((id) => byId[id]), ...arrived.filter((id) => !q.includes(id) && !skipped.includes(id) && !done.includes(id))]);
  }, [arrived, byId, skipped, done]);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ v: 2, queue, skipped, done, idx, duration, autoNext, showIdea, sound })); } catch { /* ignore */ }
  }, [queue, skipped, done, idx, duration, autoNext, showIdea, sound]);

  const current = byId[queue[idx]] || null;
  const nextUp = byId[queue[idx + 1]] || null;

  // ── timer ──
  useEffect(() => {
    if (!running) return undefined;
    const h = setInterval(() => setRemaining(endAt.current - Date.now()), 100);
    return () => clearInterval(h);
  }, [running]);
  const start = useCallback(() => { if (sound) getAudio(); endAt.current = Date.now() + remaining; setRunning(true); }, [remaining, sound]);
  const pause = useCallback(() => { setRunning(false); setRemaining(endAt.current - Date.now()); }, []);
  const toggle = useCallback(() => (running ? pause() : start()), [running, pause, start]);
  const reset = useCallback((secs = duration) => { setRunning(false); setRemaining(secs * 1000); }, [duration]);
  const addTime = useCallback((ms) => {
    if (running) { endAt.current += ms; setRemaining(endAt.current - Date.now()); } else setRemaining((r) => r + ms);
  }, [running]);
  const setDur = (secs) => { setDuration(secs); reset(secs); };

  // ── queue ──
  const goTo = useCallback((i, markDone = false) => {
    if (markDone && queue[idx] && !done.includes(queue[idx])) setDone((d) => [...d, queue[idx]]);
    setIdx(Math.max(0, Math.min(i, queue.length - 1)));
    reset();
  }, [queue, idx, done, reset]);
  const next = useCallback(() => { if (idx < queue.length - 1) goTo(idx + 1, true); else { if (queue[idx] && !done.includes(queue[idx])) setDone((d) => [...d, queue[idx]]); reset(); } }, [idx, queue, goTo, done, reset]);
  const prev = useCallback(() => goTo(idx - 1), [idx, goTo]);
  const skip = useCallback(() => {
    const id = queue[idx];
    if (!id) return;
    setSkipped((s) => [...s.filter((x) => x !== id), id]);
    setQueue((q) => q.filter((x) => x !== id));
    setIdx((i) => Math.min(i, Math.max(0, queue.length - 2)));
    reset();
  }, [queue, idx, reset]);
  const restore = (id) => { setSkipped((s) => s.filter((x) => x !== id)); setQueue((q) => [...q.slice(0, idx + 1), id, ...q.slice(idx + 1)]); };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= queue.length) return;
    setQueue((q) => { const n = [...q]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    if (idx === i) setIdx(j); else if (idx === j) setIdx(i);
  };
  const restartAll = () => {
    if (!window.confirm('להתחיל את סבב הפיצ׳ים מההתחלה?')) return;
    setDone([]); setSkipped([]); setQueue(arrived); setIdx(0); reset();
  };

  // auto-advance when time is up
  const over = remaining <= 0;
  const rang = useRef(false);
  useEffect(() => {
    if (!over) { rang.current = false; return; }
    if (running && !rang.current) {
      rang.current = true;
      if (sound) ringBell();
    }
  }, [over, running, sound]);
  useEffect(() => {
    if (running && over && autoNext && idx < queue.length - 1) next();
  }, [running, over, autoNext, idx, queue.length, next]);

  // ── keyboard ──
  useEffect(() => {
    const h = (e) => {
      if (e.target?.closest?.('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'arrowleft') next();
      else if (k === 'arrowright') prev();
      else if (k === 's') skip();
      else if (k === 'r') reset();
      else if (k === 'h') setControls((c) => !c);
      else if (k === 'f') fullscreen();
      else if (k === '+' || k === '=') addTime(15000);
      else if (k === '-') addTime(-15000);
      else if (k === 'escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const fullscreen = () => {
    const el = rootRef.current;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  const pct = Math.max(0, Math.min(100, (remaining / (duration * 1000)) * 100));
  const tone = over ? 'over' : remaining <= 10000 ? 'warn' : '';

  return (
    <div className={`pt ${tone}`} ref={rootRef} role="dialog" aria-modal="true" aria-label="טיימר פיצ׳ים">
      <header className="pt-top">
        <div className="pt-brand">{EVENT.titleHe} <M>{EVENT.titleEn}</M> <span className="pipe">|</span> <M className="brand">{EVENT.brand}</M></div>
        <div className="pt-count"><M>{Math.min(idx + 1, queue.length)}/{queue.length}</M> מציגים</div>
      </header>

      <main className="pt-stage">
        {current ? (
          <>
            <div className="pt-label">🎤 עכשיו מציג/ה</div>
            <div className="pt-name">{current.name}</div>
            <div className="pt-meta">
              <span className={`tag side-${current.side}`}>{SIDES[current.side]?.he} <M>{SIDES[current.side]?.en}</M></span>
              {showIdea && current.idea && <span className="pt-idea">{current.idea.length > 110 ? `${current.idea.slice(0, 109)}…` : current.idea}</span>}
            </div>
            <M className="pt-clock" aria-live="off">{fmt(remaining)}</M>
            {over && <div className="pt-over">הזמן נגמר</div>}
            <div className="pt-bar"><i style={{ width: `${pct}%` }} /></div>
            {nextUp && <div className="pt-next">הבא בתור: <b>{nextUp.name}</b></div>}
          </>
        ) : (
          <div className="pt-empty">
            <div className="pt-name">אין מציגים בתור</div>
            <p>סמנו 🎤 Pitch ו״✓ הגיע״ בטאב 02 – הם יופיעו כאן לפי הסדר.</p>
          </div>
        )}
      </main>

      {controls ? (
        <footer className="pt-controls">
          <div className="pt-bar-row">
            <div className="pt-group" role="group" aria-label="מציגים">
              <button className="btn btn-sm" onClick={prev} disabled={idx === 0} title="הקודם (→)">⏮</button>
              <button className="btn btn-sm" onClick={skip} disabled={!current} title="דלג (S)">⤼ דלג</button>
              <button className="btn btn-sm btn-lime" onClick={next} disabled={!current} title="הבא (←)">הבא ⏭</button>
            </div>

            <div className="pt-group pt-main" role="group" aria-label="טיימר">
              <button className="btn btn-sm" onClick={() => reset()} title="איפוס (R)">↺</button>
              <button className="btn btn-sm" onClick={() => addTime(-15000)} title="−15 שנ׳">−15</button>
              <button className={`btn pt-play ${running ? 'btn-mag' : 'btn-lime'}`} onClick={toggle} disabled={!current} title="רווח">
                {running ? '⏸ השהה' : '▶ התחל'}
              </button>
              <button className="btn btn-sm" onClick={() => addTime(15000)} title="+15 שנ׳">+15</button>
            </div>

            <div className="pt-group" role="group" aria-label="משך">
              <select className="select pt-select" value={PRESETS.includes(duration) ? duration : 'custom'} aria-label="משך כל פיץ׳"
                onChange={(e) => { if (e.target.value !== 'custom') setDur(Number(e.target.value)); else setCustom(String(duration)); }}>
                {PRESETS.map((s) => <option key={s} value={s}>{durLabel(s)}</option>)}
                <option value="custom">{PRESETS.includes(duration) ? 'אחר…' : `${duration} שנ׳`}</option>
              </select>
              {(custom !== '' || !PRESETS.includes(duration)) && (
                <input className="input mono pt-custom" placeholder="שנ׳" value={custom} inputMode="numeric" aria-label="משך מותאם בשניות"
                  onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && Number(custom) > 0) { setDur(Number(custom)); setCustom(''); } }} />
              )}
            </div>

            <div className="pt-group pt-tools">
              <button className={`btn btn-sm ${queueOpen ? 'btn-dark' : ''}`} onClick={() => setQueueOpen((v) => !v)} aria-expanded={queueOpen}>
                תור <M>{queue.length}</M>{skipped.length ? <M className="pt-badge">{skipped.length}</M> : null} {queueOpen ? '▴' : '▾'}
              </button>
              <div className="pt-menu-wrap">
                <button className="btn btn-sm" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} title="הגדרות">⚙</button>
                {menuOpen && (
                  <div className="pt-menu" role="menu">
                    <label className="pt-check"><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> מעבר אוטומטי כשהזמן נגמר</label>
                    <label className="pt-check"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> 🔔 צלצול בסוף הזמן</label>
                    {sound && <button className="btn btn-sm" onClick={ringBell}>▶ השמע צלצול לבדיקה</button>}
                    <label className="pt-check"><input type="checkbox" checked={showIdea} onChange={(e) => setShowIdea(e.target.checked)} /> הצג את המיזם</label>
                    <button className="btn btn-sm" onClick={() => { fullscreen(); setMenuOpen(false); }}>⛶ מסך מלא <M>F</M></button>
                    <button className="btn btn-sm" onClick={() => { setControls(false); setMenuOpen(false); }}>הסתר שליטה <M>H</M></button>
                    {(done.length > 0 || skipped.length > 0) && <button className="btn btn-sm" onClick={() => { setMenuOpen(false); restartAll(); }}>↺ התחל סבב פיצ׳ים מחדש</button>}
                    <div className="pt-keys small"><M>Space</M> התחל/השהה · <M>←/→</M> הבא/הקודם · <M>S</M> דלג · <M>R</M> איפוס · <M>+/−</M> 15 שנ׳</div>
                  </div>
                )}
              </div>
              <button className="btn btn-sm btn-danger" onClick={onClose} title="סגור (Esc)">✕</button>
            </div>
          </div>

          {queueOpen && (
            <div className="pt-queue">
              {queue.map((id, i) => (
                <div key={id} className={`pt-q ${i === idx ? 'on' : ''} ${done.includes(id) ? 'done' : ''}`}>
                  <button className="pt-q-name" onClick={() => goTo(i)} title="עבור למציג/ה">
                    <M>{i + 1}.</M> {byId[id]?.name}{done.includes(id) ? ' ✓' : ''}
                  </button>
                  <button className="pt-q-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="הקדם">▲</button>
                  <button className="pt-q-btn" onClick={() => move(i, 1)} disabled={i === queue.length - 1} aria-label="אחר">▼</button>
                </div>
              ))}
              {skipped.length > 0 && (
                <div className="pt-skipped">
                  <span>דולגו:</span>
                  {skipped.map((id) => (
                    <button key={id} className="btn btn-xs" onClick={() => restore(id)} title="החזר לתור אחרי הנוכחי">↩ {byId[id]?.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </footer>
      ) : (
        <button className="pt-show" onClick={() => setControls(true)} title="H">שליטה</button>
      )}
    </div>
  );
}
