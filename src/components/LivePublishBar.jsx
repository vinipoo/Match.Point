import { useState } from 'react';
import { M } from './ui';

// "🚀 Publish live" + QR – shared by the board, export and event-night tabs
export default function LivePublishBar({ publishLive, openQr, boardDirty, cloud, meetings }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await publishLive(); setBusy(false); };
  const when = cloud?.publishedAt ? new Date(cloud.publishedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="live-publish">
      <button className="btn btn-lime btn-lg" onClick={go} disabled={busy || !meetings.length}>
        {busy ? 'מפרסם…' : '🚀 פרסם שיבוץ חי למשתתפים'}
      </button>
      <button className="btn btn-dark" onClick={openQr}>▦ קוד <M>QR</M> להקרנה</button>
      {when && !boardDirty && <span className="small">פורסם ב-<M>{when}</M> ✓</span>}
      {boardDirty && <span className="tag tag-mag">הלוח השתנה מאז הפרסום – פרסמו שוב</span>}
      {!cloud?.key && <span className="small muted">דורש חיבור לענן בטאב <M>03</M></span>}
    </div>
  );
}
