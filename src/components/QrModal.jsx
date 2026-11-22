import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { EVENT } from '../lib/constants';
import { M } from './ui';

// Full-screen QR for projecting on the venue screen: opens the participant page
export const participantEntryUrl = () => `${window.location.origin}${window.location.pathname}`;

export default function QrModal({ onClose }) {
  const url = participantEntryUrl();
  const [src, setSrc] = useState('');

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 900, errorCorrectionLevel: 'M', color: { dark: '#232629', light: '#FFFFFF' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [url]);

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="qr-screen" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button className="qr-close" onClick={onClose} aria-label="סגור">ESC ✕</button>
      <div className="qr-card">
        <div className="qr-title">
          {EVENT.titleHe} <M>{EVENT.titleEn}</M> <span className="pipe">|</span> <M className="brand">{EVENT.brand}</M>
        </div>
        <div className="qr-sub">סרקו כדי לבחור את מי תרצו לפגוש ולראות את הלו״ז האישי שלכם</div>
        {src ? <img className="qr-img" src={src} alt={`QR לכניסה: ${url}`} /> : <div className="qr-img" />}
        <M className="qr-url">{url.replace(/^https?:\/\//, '')}</M>
        <div className="qr-hint">כניסה עם השם שלכם + 4 הספרות האחרונות של הטלפון</div>
      </div>
    </div>
  );
}
