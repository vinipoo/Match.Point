import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENT, SIDES } from '../lib/constants';
import { M } from './ui';

// Full-screen pitch timer for the venue screen. Staff control everything from this screen:
// start / pause / reset / ±15s / duration, next / previous / skip, jump to anyone, reorder the queue.
const STORE = 'mp-pitch-timer';
const PRESETS = [60, 90, 120, 180];
const fmt = (ms) => {
  const neg = ms < 0;
  const s = Math.ceil(Math.abs(ms) / 1000);
  return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };

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
  const [duration, setDuration] = useState(saved.duration || 90);
  const [autoNext, setAutoNext] = useState(!!saved.autoNext);
  const [showIdea, setShowIdea] = useState(saved.showIdea !== false);
  const [remaining, setRemaining] = useState((saved.duration || 90) * 1000);
  const [running, setRunning] = useState(false);
  const [controls, setControls] = useState(true);
  const [custom, setCustom] = useState('');
  const endAt = useRef(null);
  const rootRef = useRef(null);

  // new presenters marked during the session join the end of the queue
  useEffect(() => {
    setQueue((q) => [...q.filter((id) => byId[id]), ...arrived.filter((id) => !q.includes(id) && !skipped.includes(id) && !done.includes(id))]);
  }, [arrived, byId, skipped, done]);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ queue, skipped, done, idx, duration, autoNext, showIdea })); } catch { /* ignore */ }
  }, [queue, skipped, done, idx, duration, autoNext, showIdea]);

  const current = byId[queue[idx]] || null;
  const nextUp = byId[queue[idx + 1]] || null;

  // ── timer ──
  useEffect(() => {
    if (!running) return undefined;
    const h = setInterval(() => setRemaining(endAt.current - Date.now()), 100);
    return () => clearInterval(h);
  }, [running]);
  const start = useCallback(() => { endAt.current = Date.now() + remaining; setRunning(true); }, [remaining]);
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
          <div className="pt-row">
            <button className="btn" onClick={prev} disabled={idx === 0} title="הקודם (→)">⏮ הקודם</button>
            <button className={`btn btn-lg ${running ? 'btn-mag' : 'btn-lime'}`} onClick={toggle} disabled={!current} title="רווח">{running ? '⏸ השהה' : '▶ התחל'}</button>
            <button className="btn" onClick={() => reset()} title="R">↺ איפוס</button>
            <button className="btn" onClick={() => addTime(-15000)} title="−">−15 שנ׳</button>
            <button className="btn" onClick={() => addTime(15000)} title="+">+15 שנ׳</button>
            <button className="btn" onClick={skip} disabled={!current} title="S">⤼ דלג</button>
            <button className="btn btn-lime" onClick={next} disabled={!current} title="הבא (←)">הבא ⏭</button>
          </div>
          <div className="pt-row small">
            <span>משך:</span>
            {PRESETS.map((s) => (
              <button key={s} className={`btn btn-sm ${duration === s ? 'btn-dark' : ''}`} onClick={() => setDur(s)}>{s % 60 ? `${s / 60} דק׳` : `${s / 60} דק׳`}</button>
            ))}
            <input className="input mono" style={{ width: 70 }} placeholder="שנ׳" value={custom} inputMode="numeric"
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && Number(custom) > 0) { setDur(Number(custom)); setCustom(''); } }} aria-label="משך מותאם בשניות" />
            <label className="pt-check"><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> מעבר אוטומטי לבא כשהזמן נגמר</label>
            <label className="pt-check"><input type="checkbox" checked={showIdea} onChange={(e) => setShowIdea(e.target.checked)} /> הצג את המיזם</label>
            <span className="pt-spacer" />
            <button className="btn btn-sm" onClick={fullscreen} title="F">⛶ מסך מלא</button>
            <button className="btn btn-sm" onClick={() => setControls(false)} title="H">הסתר שליטה</button>
            <button className="btn btn-sm btn-danger" onClick={onClose}>סגור</button>
          </div>

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
            {(done.length > 0 || skipped.length > 0) && <button className="btn btn-xs btn-ghost" onClick={restartAll}>התחל מחדש</button>}
          </div>
          <div className="pt-keys small"><M>Space</M> התחל/השהה · <M>←/→</M> הבא/הקודם · <M>S</M> דלג · <M>R</M> איפוס · <M>+/−</M> 15 שנ׳ · <M>H</M> הסתר · <M>F</M> מסך מלא</div>
        </footer>
      ) : (
        <button className="pt-show" onClick={() => setControls(true)} title="H">שליטה</button>
      )}
    </div>
  );
}
