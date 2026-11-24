export const EVENT = {
  titleHe: 'ספידייטינג למציאת',
  titleEn: 'Co-Founder',
  brand: 'Match.Point',
  venueHe: 'הרציף',
  venueEn: 'The Platform',
  date: '24.11.26',
  doors: '18:00',
  address: 'הגליל 6, תל אביב-יפו',
};

export const SIDES = {
  tech: { he: 'טכנולוגי', en: 'Tech' },
  business: { he: 'עסקי', en: 'Business' },
  both: { he: 'היברידי', en: 'Both' },
};

export const STATUSES = {
  confirmed: { he: 'מאושר', en: 'Confirmed' },
  checked_in: { he: 'הגיע', en: 'Checked-in' },
  no_show: { he: 'לא הגיע', en: 'No-show' },
  pending: { he: 'בהמתנה', en: 'Pending' },
};

export const STAGES = { none: 'ללא מיזם', idea: 'רעיון', mvp: 'MVP', growth: 'צמיחה' };

export const VENTURE = {
  own: 'יש מיזם – מחפש/ת שותף',
  join: 'רוצה להצטרף למיזם קיים',
  new: 'הקמה מאפס',
  flex: 'גמיש/ה',
};

export const AVAIL = { full: 'משרה מלאה', part: 'משרה חלקית', evenings: 'ערבים / סופ"ש' };

export const WEIGHT_LABELS = {
  prefs: { he: 'העדפות מפורשות', en: 'Mutual / Picks' },
  role: { he: 'השלמה בתפקיד וכישורים', en: 'Role fit' },
  venture: { he: 'כיוון המיזם ושלב', en: 'Venture' },
  availability: { he: 'זמינות ומחויבות', en: 'Availability' },
  industry: { he: 'חפיפת תחום / תעשייה', en: 'Industry' },
};

export const DEFAULT_WEIGHTS = { prefs: 45, role: 25, venture: 15, availability: 10, industry: 5 };

export const DEFAULT_SETTINGS = {
  rounds: 6,
  tables: 30,
  roundMin: 10,
  transitionMin: 2,
  doorsTime: '18:00',
  startTime: '18:45',
  threshold: 30,
  minMeetings: 3,
  engineVersion: 4,
  seatEveryone: true,
  allowSameSide: false,
  enforceVentureRule: true,
  fairnessFallback: true,
  fallbackDrop: 10,
  liveMode: false,
  includePending: false,
  currentRound: 1,
  wildcardEnabled: true,
  wildcardRound: 2,
  wildcardSeed: 1,
};
