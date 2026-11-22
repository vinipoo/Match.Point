import { Card, Kpi, Alert, M, SideTag } from './ui';

export default function GapPanel({ gaps, settings, setSettings, num = 'GAP' }) {
  const { counts, total, weak, imbalance, rescueCount, tablesShort } = gaps;
  const ratioTxt = gaps.bizSide ? (gaps.techSide / gaps.bizSide).toFixed(2) : '—';
  const imbalanced = total > 0 && imbalance >= Math.max(3, Math.round(total * 0.15));

  return (
    <Card num={num} title="דשבורד פערים והתראות" en="Gap Analysis">
      {total === 0 ? (
        <div className="muted">אין עדיין משתתפים פעילים. טענו נתונים כדי לראות ניתוח פערים.</div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="kpis">
            <Kpi value={counts.tech} label={<>טכנולוגיים <M>Tech</M></>} />
            <Kpi value={counts.business} label={<>עסקיים <M>Business</M></>} tone="mag" />
            <Kpi value={counts.both} label={<>היברידיים <M>Both</M></>} tone="ghost" size="sm" />
            <Kpi value={ratioTxt} sub="Tech : Biz" label="יחס צדדים" tone="dark" size="sm" />
            <Kpi value={total} sub="active" label="משובצים פוטנציאליים" tone="ghost" size="sm" />
          </div>

          {imbalanced && (
            <Alert tone="warn" icon="!" title={`פער מספרי של ${imbalance} בין הצדדים`}>
              {counts.tech > counts.business ? 'יש יותר טכנולוגיים מעסקיים' : 'יש יותר עסקיים מטכנולוגיים'} – חלק מהמשתתפים
              יישארו בסבבי נטוורקינג. מומלץ לאפשר התאמות משלימות בתוך אותו צד.
            </Alert>
          )}

          {tablesShort && (
            <Alert tone="warn" icon="!" title="אין מספיק שולחנות">
              <M>{settings.tables}</M> שולחנות מאפשרים עד <M>{settings.tables * 2}</M> משתתפים בסבב, אבל יש <M>{total}</M> פעילים.
              כדי שכולם יקבלו <M>{settings.minMeetings}</M> פגישות רצופות בהתחלה צריך לפחות <M>{gaps.tablesNeeded}</M> שולחנות.
            </Alert>
          )}

          {weak.length > 0 ? (
            <Alert
              tone="warn"
              icon={weak.length}
              title={`${weak.length} משתתפים עם פחות מ-${settings.minMeetings} התאמות מעל הסף (${settings.threshold})`}
              action={
                !settings.allowSameSide && rescueCount > 0 ? (
                  <button className="btn btn-mag btn-sm" onClick={() => setSettings({ allowSameSide: true })}>
                    אפשר התאמות בתוך אותו צד ({rescueCount})
                  </button>
                ) : null
              }
            >
              <div className="chips" style={{ marginTop: 6 }}>
                {weak.map(({ p, opts, rescue }) => (
                  <span key={p.id} className="tag" title={`${opts} התאמות טובות${rescue ? ` · ${rescue} נוספות בתוך הצד` : ''}`}>
                    {p.name} <SideTag side={p.side} /> <M>{opts}{rescue ? `+${rescue}` : ''}</M>
                  </span>
                ))}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                הם עדיין יקבלו <M>{settings.minMeetings}</M> פגישות רצופות בהתחלה: ההשלמה נעשית מול המועמדים עם הציון הגבוה ביותר לפי הטופס והפרופיל
                {settings.fairnessFallback ? ' (כולל מאותו צד, אם אין פרטנר מהצד השני)' : ''}.
              </div>
            </Alert>
          ) : (
            <Alert tone="ok" icon="✓" title="לכל המשתתפים יש מספיק התאמות איכותיות">
              כל משתתף פעיל מחזיק לפחות <M>{settings.minMeetings}</M> אפשרויות מעל הסף.
            </Alert>
          )}
          {settings.allowSameSide && (
            <Alert tone="info" icon="≈" title="התאמות בתוך אותו צד פעילות"
              action={<button className="btn btn-sm" onClick={() => setSettings({ allowSameSide: false })}>כבה</button>}>
              זוגות Tech-Tech / Biz-Biz מקבלים ניקוד לפי כישורים משלימים.
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}
