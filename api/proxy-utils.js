/**
 * Shared CORS + rate limiting for the Vercel Node serverless functions in /api.
 *
 * Rate limiting is in-memory (per warm lambda instance) — a lightweight guard
 * against a single client hammering the endpoint, not a hard global limit.
 * Vercel can spin up multiple instances under load, so this doesn't enforce
 * a true global cap. Swap in Upstash/Redis if that's ever needed.
 */

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const hits = new Map(); // ip -> array of request timestamps

export function corsMiddleware(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return null; // headers only — this never blocks a request
}

export function rateLimitMiddleware(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(ip) || []).filter((ts) => ts > windowStart);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    return 'Rate limit exceeded, slow down';
  }
  recent.push(now);
  hits.set(ip, recent);
  return null;
}
