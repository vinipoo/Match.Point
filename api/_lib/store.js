// Storage: Upstash Redis on Vercel (env vars injected by the Vercel integration),
// in-memory Map for local development.
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
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
