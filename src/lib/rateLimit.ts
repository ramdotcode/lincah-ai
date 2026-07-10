import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Sliding-window limits, tunable via env without redeploying code changes
const WINDOW_SECONDS = 60;
const SENDER_MAX = parseInt(process.env.RATE_LIMIT_SENDER_MAX || '10', 10);
const BOT_MAX = parseInt(process.env.RATE_LIMIT_BOT_MAX || '120', 10);
const UPSTASH_TIMEOUT_MS = 500;

export interface RateLimitResult {
  limited: boolean;
  reason?: 'sender' | 'bot';
  // True the first time a sender hits the limit in a window — reply once, not per message
  shouldNotify: boolean;
}

const ALLOWED: RateLimitResult = { limited: false, shouldNotify: false };

let redis: Redis | null = null;
let senderLimiter: Ratelimit | null = null;
let botLimiter: Ratelimit | null = null;

function getLimiters() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    senderLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(SENDER_MAX, `${WINDOW_SECONDS} s`),
      prefix: 'rl',
    });
    botLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(BOT_MAX, `${WINDOW_SECONDS} s`),
      prefix: 'rl',
    });
  }
  return { redis, senderLimiter: senderLimiter!, botLimiter: botLimiter! };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Rate limit check timed out')), UPSTASH_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Checks per-sender and per-bot limits. Fail-open: if Upstash is not
 * configured, errors, or times out, the message is allowed through.
 */
export async function checkRateLimit(
  channel: 'telegram' | 'whatsapp' | 'webchat',
  senderId: string,
  botId: string
): Promise<RateLimitResult> {
  const limiters = getLimiters();
  if (!limiters) return ALLOWED;

  try {
    const [sender, bot] = await withTimeout(
      Promise.all([
        limiters.senderLimiter.limit(`sender:${channel}:${senderId}`),
        limiters.botLimiter.limit(`bot:${botId}`),
      ])
    );

    if (sender.success && bot.success) return ALLOWED;

    const reason: 'sender' | 'bot' = sender.success ? 'bot' : 'sender';

    // Notify the sender only once per window (SET NX with TTL)
    let shouldNotify = false;
    if (reason === 'sender') {
      const set = await withTimeout(
        limiters.redis.set(`rl:notified:${channel}:${senderId}`, '1', {
          nx: true,
          ex: WINDOW_SECONDS,
        })
      );
      shouldNotify = set === 'OK';
    }

    return { limited: true, reason, shouldNotify };
  } catch (err) {
    console.error('[RateLimit] Check failed, failing open:', err);
    return ALLOWED;
  }
}

export const RATE_LIMIT_REPLY = 'Mohon tunggu sebentar ya, pesan Anda terlalu banyak dalam waktu singkat. Silakan coba lagi sebentar lagi. 🙏';
