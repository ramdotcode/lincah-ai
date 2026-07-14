import { Redis } from '@upstash/redis';

// Cache ringan berbasis Upstash Redis (Fase E1) untuk data yang dibaca tiap
// pesan masuk (bot, knowledge, agents, tools). Fail-open: tanpa env/error/
// timeout, langsung jatuh ke fetcher — sama seperti pola rate limit.

const CACHE_TIMEOUT_MS = 500;
export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '60', 10);

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Cache operation timed out')), CACHE_TIMEOUT_MS)
    ),
  ]);
}

// Kunci cache terpusat supaya penulisan & invalidasi konsisten
export const cacheKeys = {
  botById: (id: string) => `cache:bot:id:${id}`,
  botByPhone: (phone: string) => `cache:bot:phone:${phone}`,
  knowledge: (botId: string) => `cache:knowledge:${botId}`,
  assignments: (botId: string) => `cache:assignments:${botId}`,
  tools: (botId: string) => `cache:tools:${botId}`,
  // Koneksi WA level akun; key = session key worker (user_id/bot_id) atau phone:<nomor>
  waConnection: (key: string) => `cache:wa-conn:${key}`,
};

/**
 * Ambil dari cache, atau jalankan fetcher lalu simpan hasilnya.
 * Nilai null/undefined dari fetcher tidak di-cache (mis. bot tidak ditemukan).
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = CACHE_TTL_SECONDS
): Promise<T> {
  const client = getRedis();
  if (!client) return fetcher();

  try {
    const hit = await withTimeout(client.get<T>(key));
    if (hit !== null && hit !== undefined) return hit;
  } catch (err) {
    console.error('[Cache] Read failed, falling through:', err);
    return fetcher();
  }

  const value = await fetcher();
  if (value !== null && value !== undefined) {
    try {
      await withTimeout(client.set(key, value, { ex: ttlSeconds }));
    } catch (err) {
      console.error('[Cache] Write failed, ignoring:', err);
    }
  }
  return value;
}

/** Hapus kunci cache (dipanggil route save/delete). Best-effort, tidak pernah throw. */
export async function invalidateCache(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;
  try {
    await withTimeout(client.del(...keys));
  } catch (err) {
    console.error('[Cache] Invalidate failed, ignoring:', err);
  }
}
