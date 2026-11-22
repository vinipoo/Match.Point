// Participant-safe profile that is published to phones (no phone / email)
import { STAGES } from './constants';

const TECH_WORDS = /פיתוח|full-?stack|backend|frontend|mobile|ai|ml|data|iot|embedded|hardware|סייבר|devops|react|cto|blockchain|llm/i;
const BIZ_WORDS = /עסקי|מכירות|שיווק|go-to-market|גיוס|פיננס|תפעול|growth|רגולציה|ceo|מנכ|שותפויות|לוגיסטיקה|מיתוג/i;

// which side this person is looking for in a partner
export function seeksSide(p) {
  const s = [...(p.seekSkills || []), p.seeking || ''].join(' ');
  const tech = TECH_WORDS.test(s);
  const biz = BIZ_WORDS.test(s);
  if (tech && !biz) return 'tech';
  if (biz && !tech) return 'business';
  if (tech && biz) return 'any';
  return p.side === 'tech' ? 'business' : p.side === 'business' ? 'tech' : 'any';
}

const SEEK_TEXT = { tech: 'שותף/ה טכנולוגי/ת', business: 'שותף/ה עסקי/ת', any: 'שותף/ה משלים/ה' };

// Fixed domain list (the registration form's options). Anything else is grouped under "אחר".
export const DOMAINS = [
  'AI / Data', 'SaaS / B2B Software', 'בריאות', 'פיננסים', 'E-commerce / Retail', 'Lifestyle', 'טכנולוגיה',
  'תקשורת / Media', 'אנרגיה', 'חינוך', 'פנאי', 'אקלים / סביבה', 'FoodTech', 'תחבורה / Mobility',
  'HR / Future of Work', 'חקלאות', 'סייבר',
];
const DOMAIN_ALIASES = {
  ai: 'AI / Data', 'ai/data': 'AI / Data', data: 'AI / Data', saas: 'SaaS / B2B Software', b2b: 'SaaS / B2B Software',
  'בריאות דיגיטלית': 'בריאות', healthtech: 'בריאות', 'פינטק': 'פיננסים', fintech: 'פיננסים', 'נדל"ן': 'פיננסים',
  'e-commerce': 'E-commerce / Retail', ecommerce: 'E-commerce / Retail', retail: 'E-commerce / Retail', 'צרכנות': 'E-commerce / Retail',
  media: 'תקשורת / Media', 'תקשורת': 'תקשורת / Media', 'קלימטק': 'אקלים / סביבה', 'סביבה': 'אקלים / סביבה', 'קיימות': 'אקלים / סביבה',
  'תחבורה': 'תחבורה / Mobility', mobility: 'תחבורה / Mobility', 'מובילות': 'תחבורה / Mobility', hr: 'HR / Future of Work',
  'אגריטק': 'חקלאות', agritech: 'חקלאות', cyber: 'סייבר', edtech: 'חינוך',
};
const canonKey = (s) => String(s).trim().toLowerCase().replace(/\s*\/\s*/g, '/');
const CANON = new Map(DOMAINS.map((d) => [canonKey(d), d]));

export function canonicalIndustry(list = []) {
  const industry = [];
  const other = [];
  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const k = canonKey(s);
    const hit = CANON.get(k) || DOMAIN_ALIASES[k] || DOMAIN_ALIASES[s];
    if (hit) { if (!industry.includes(hit)) industry.push(hit); }
    else if (s !== 'אחר') other.push(s);
    else if (!industry.includes('אחר')) industry.push('אחר');
  }
  if (other.length && !industry.includes('אחר')) industry.push('אחר');
  return { industry, industryOther: other };
}

export function toPublicProfile(p) {
  const side = seeksSide(p);
  const { industry, industryOther } = canonicalIndustry(p.industry || []);
  return {
    id: p.id,
    name: p.name,
    side: p.side,
    industry,
    industryOther,
    idea: p.idea || '',
    brings: p.brings || '',
    seeking: p.seeking || SEEK_TEXT[side],
    stage: p.stage && p.stage !== 'none' ? STAGES[p.stage] || p.stage : '',
    seeksSide: side,
  };
}
