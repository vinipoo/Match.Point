// Storage: Upstash Redis on Vercel (env vars injected by the Vercel integration),
// in-memory Map for local development.
import { Redis } from '@upstash/redis';

// The Vercel integration may add a custom prefix (e.g. STORAGE_KV_REST_API_URL), so match by suffix.
const envBySuffix = (...suffixes) => {
  for (const suffix of suffixes) {
    if (process.env[suffix]) return process.env[suffix];
    const key = Object.keys(process.env).find((k) => k.endsWith(`_${suffix}`) && !k.includes('READ_ONLY'));
    if (key && process.env[key]) return process.env[key];
  }
  return undefined;
};
const url = envBySuffix('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const token = envBySuffix('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
const redis = url && token ? new Redis({ url, token }) : null;

const mem = globalThis.__matchpointMem || (globalThis.__matchpointMem = new Map());
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

export const mode = redis ? 'redis' : 'memory';

export async function get(key) {
  if (redis) return (await redis.get(key)) ?? null;
  return clone(mem.get(key));
}

export async function set(key, value) {
  if (redis) return redis.set(key, value);
  mem.set(key, clone(value));
  return 'OK';
}

export async function mget(keys) {
  if (!keys.length) return [];
  if (redis) return redis.mget(...keys);
  return keys.map((k) => clone(mem.get(k)));
}

export async function del(keys) {
  if (!keys.length) return 0;
  if (redis) return redis.del(...keys);
  keys.forEach((k) => mem.delete(k));
  return keys.length;
}
