import { useEffect, useState } from 'react';
import { Alert, M } from './ui';
import { members } from '../engine/scheduler';

// Persistent warnings that explain an empty / outdated board:
//  1. not enough tables for everyone present (the run is refused until fixed)
//  2. the board was built before people were marked as arrived
export default function ScheduleHealth({ active, settings, setSettings, meetings, run }) {
  const [runAfterFix, setRunAfterFix] = useState(false);
  const need = Math.floor(active.length / 2);
  const short = active.length >= 2 && Number(settings.tables) < need;

  // run once the new table count is in state
  useEffect(() => {
    if (runAfterFix && Number(settings.tables) >= need) { setRunAfterFix(false); run('fresh'); }
  }, [runAfterFix, settings.tables, need, run]);

  if (short) {
    return (
      <Alert tone="warn" icon="!" title={`חסרים שולחנות: ל-${active.length} הנוכחים צריך לפחות ${need} שולחנות (מוגדרים ${settings.tables})`}
        action={<button className="btn btn-mag" onClick={() => { setSettings({ tables: need }); setRunAfterFix(true); }}>קבע <M>{need}</M> שולחנות והרץ שיבוץ</button>}>
        בלי מספיק שולחנות לא ניתן לתת לכל נוכח {settings.minMeetings} פגישות רצופות בהתחלה, ולכן המערכת לא מריצה שיבוץ. אם יש באולם יותר שולחנות – עדכנו בטאב 01.
      </Alert>
    );
  }

  if (meetings.length) {
    const seated = new Set(meetings.filter((m) => m.round === 1).flatMap(members));
    const missing = active.filter((id) => !seated.has(id)).length;
    if (missing >= 2) {
      return (
        <Alert tone="warn" icon={missing} title={`הלוח לא מעודכן: ${missing} נוכחים לא משובצים בסבב 1`}
          action={<button className="btn btn-mag" onClick={() => run('fresh')}>▶ הרץ שיבוץ מחדש</button>}>
          כנראה שסומנו כ״הגיע״ אחרי שהלוח נבנה. הרצה מחדש תשבץ את כל הנוכחים.
        </Alert>
      );
    }
  }
  return null;
}
