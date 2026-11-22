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

export function toPublicProfile(p) {
  const side = seeksSide(p);
  return {
    id: p.id,
    name: p.name,
    side: p.side,
    industry: p.industry || [],
    idea: p.idea || '',
    brings: p.brings || '',
    seeking: p.seeking || SEEK_TEXT[side],
    stage: p.stage && p.stage !== 'none' ? STAGES[p.stage] || p.stage : '',
    seeksSide: side,
  };
}
