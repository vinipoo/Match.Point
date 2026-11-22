import crypto from 'node:crypto';
import { mode } from './store.js';

export const K = {
  event: 'mp:event',
  roster: 'mp:roster',
  tokens: 'mp:tokens', // token -> participant id
  auth: 'mp:auth', // participant id -> last 4 phone digits (private, for login)
  login: (id) => `mp:login:${id}`, // failed-login counter
  pitched: 'mp:pitched',
  schedule: 'mp:schedule',
  staff: 'mp:staff',
  prefs: (id) => `mp:prefs:${id}`,
};

// setup = pre-event · open = VOTING · closed = LOCKED · published = LIVE
export const PHASES = ['setup', 'open', 'closed', 'published'];

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const newToken = () => [...crypto.randomBytes(12)].map((b) => ABC[b % ABC.length]).join('');

export function send(res, code, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json(obj);
}

export function readBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return req.body || {};
}

// Phases change only when staff press a button – the optional timer is display-only and never locks
export function effectivePhase(ev) {
  return PHASES.includes(ev?.phase) ? ev.phase : 'setup';
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkAdmin(req) {
  const expected = process.env.ADMIN_KEY || (process.env.VERCEL ? null : 'dev');
  if (!expected) return { ok: false, code: 503, error: 'ADMIN_KEY לא הוגדר בפרויקט ב-Vercel' };
  const got = req.headers['x-admin-key'];
  if (!got || !safeEqual(got, expected)) return { ok: false, code: 401, error: 'מפתח צוות שגוי' };
  return { ok: true };
}

// On Vercel, memory storage would lose data between requests – refuse instead.
export const storageProblem = () =>
  mode === 'memory' && process.env.VERCEL
    ? 'האחסון לא מחובר: יש לחבר Upstash Redis לפרויקט ב-Vercel (Storage → Connect)'
    : null;

// Public, participant-safe profile (never phone / email)
export const publicProfile = (p) => ({
  id: String(p.id),
  name: String(p.name || ''),
  side: p.side,
  industry: Array.isArray(p.industry) ? p.industry.map(String) : [],
  idea: String(p.idea || ''),
  brings: String(p.brings || ''),
  seeking: String(p.seeking || ''),
  stage: String(p.stage || ''),
  seeksSide: ['tech', 'business', 'both', 'any'].includes(p.seeksSide) ? p.seeksSide : 'any',
});
