import { useEffect } from 'react';
import { SIDES, STATUSES } from '../lib/constants';

export const M = ({ children, className = '', ...rest }) => (
  <span className={`mono ${className}`} {...rest}>{children}</span>
);

export function Card({ num, title, en, actions, children, className = '', flush = false }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-h">
        {num && <M className="card-num">{num}</M>}
        <h3>{title}</h3>
        {en && <M className="card-en">{en}</M>}
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      <div className={`card-b ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export const SideTag = ({ side }) => (
  <span className={`tag side-${side}`}>{SIDES[side]?.he} <M>{SIDES[side]?.en}</M></span>
);

export const StatusTag = ({ status }) => (
  <span className={`tag st-${status}`}>{STATUSES[status]?.he}</span>
);

export const Reason = ({ x, locked }) => (
  <span className="row" style={{ gap: 4 }}>
    {locked && <span className="reason lock">נעול ידנית</span>}
    <span className={`reason ${x.kind}`}>
      {x.label}{x.kind !== 'wild' && <> <M>// {x.score}%</M></>}
    </span>
  </span>
);

export function Kpi({ value, sub, label, tone = '', size = '' }) {
  return (
    <div className={`kpi ${tone} ${size}`}>
      <div className="circle">
        <div>
          {value}
          {sub != null && <small>{sub}</small>}
        </div>
      </div>
      {label && <div className="lbl">{label}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sw" />
      <span>
        <span className="t">{label}</span>
        {hint && <div className="h">{hint}</div>}
      </span>
    </label>
  );
}

export function NumField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input mono"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));
        }}
      />
    </label>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="סגור">ESC ✕</button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Alert({ tone = 'info', icon = 'i', title, children, action }) {
  return (
    <div className={`alert ${tone}`}>
      <span className="ic">{icon}</span>
      <div className="body">
        {title && <b>{title}</b>}
        {children && <div className="small">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export const Empty = ({ title, children }) => (
  <div className="empty">
    <h3>{title}</h3>
    <div className="muted">{children}</div>
  </div>
);
