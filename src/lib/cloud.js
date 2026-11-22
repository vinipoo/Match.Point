// Client helpers for the /api functions
async function call(path, { method = 'GET', key, body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `שגיאת שרת (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const adminApi = (key) => ({
  status: () => call('/api/admin?action=status', { key }),
  publishRoster: (participants) => call('/api/admin?action=roster', { method: 'POST', key, body: { participants } }),
  setPhase: (phase, extra = {}) => call('/api/admin?action=phase', { method: 'POST', key, body: { phase, ...extra } }),
  setPitched: (ids) => call('/api/admin?action=pitched', { method: 'POST', key, body: { ids } }),
  publishSchedule: (payload) => call('/api/admin?action=schedule', { method: 'POST', key, body: payload }),
  saveStaff: (state) => call('/api/admin?action=staff', { method: 'POST', key, body: { state } }),
  loadStaff: () => call('/api/admin?action=staff', { key }),
  reset: () => call('/api/admin?action=reset', { method: 'POST', key, body: {} }),
});

export const participantApi = {
  load: (t) => call(`/api/participant?t=${encodeURIComponent(t)}`),
  savePrefs: (t, list) => call('/api/participant', { method: 'POST', body: { t, list } }),
  directory: () => call('/api/participant?action=directory'),
  login: (id, last4) => call('/api/participant', { method: 'POST', body: { action: 'login', id, last4 } }),
};

export const participantLink = (token) =>
  token ? `${window.location.origin}${window.location.pathname}?p=${token}` : '';

// stable fingerprint of a board, to know whether it changed since publishing
export function boardHash(meetings) {
  const s = [...meetings]
    .map((m) => `${m.round}.${m.table}.${[m.a, m.b].sort().join('-')}`)
    .sort()
    .join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const countdown = (ms) => {
  if (ms <= 0) return '00:00';
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
