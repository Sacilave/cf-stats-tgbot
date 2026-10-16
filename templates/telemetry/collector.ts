/**
 * Reusable Telemetry Collector Module
 * Features:
 * - Unified D1 Database with dedicated per-site table isolation (e.g. stats_pinteresthd_lave_fun)
 * - Edge client IP extraction via CF-Connecting-IP (un-spoofable behind Cloudflare)
 * - IPv6 /64 prefix clustering for flood control (defeats bot IPv6 rotation attacks)
 * - Strict Cross-Origin & Hotlink rejection (blocks third-party telemetry spam)
 * - Cloudflare Geo extraction (country, city)
 * - In-memory edge flood control (protects Cloudflare D1 write quota)
 * - Safe parameterized SQL execution with strict table identifier validation
 * - Graceful fallback if D1 binding is not yet attached
 */

import { TelemetryEnv, IngestPayload } from './types.ts';
import { normalizeClientIp, isAllowedOrigin } from '../security.ts';

// In-memory flood protection (Max 20 events per IP/Subnet per minute across telemetry)
const floodMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(key: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now();
  if (floodMap.size > 2000) {
    for (const [k, v] of floodMap.entries()) {
      if (now > v.resetTime) floodMap.delete(k);
    }
    if (floodMap.size > 3000) floodMap.clear();
  }

  const entry = floodMap.get(key);
  if (!entry || now > entry.resetTime) {
    floodMap.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (entry.count >= limit) {
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Derives a standardized, injection-safe SQL table name for the target site.
 * Rule: stats_<site_slug> (e.g. pinteresthd.lave.fun -> stats_pinteresthd_lave_fun)
 */
export function getTelemetryTableName(env: TelemetryEnv, siteId?: string): string {
  if (siteId && siteId !== env.SITE_DOMAIN) {
    const slug = siteId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const name = slug.startsWith('stats_') ? slug : `stats_${slug}`;
    return /^[a-zA-Z0-9_]+$/.test(name) ? name : 'stats_default';
  }
  if (env.TELEMETRY_TABLE && /^[a-zA-Z0-9_]+$/.test(env.TELEMETRY_TABLE)) {
    return env.TELEMETRY_TABLE;
  }
  const raw = siteId || env.SITE_DOMAIN || 'pinteresthd_lave_fun';
  const slug = raw.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const name = slug.startsWith('stats_') ? slug : `stats_${slug}`;
  return /^[a-zA-Z0-9_]+$/.test(name) ? name : 'stats_default';
}

export async function ingestTelemetryEvent(
  request: Request,
  env: TelemetryEnv,
  payload: IngestPayload
): Promise<{ success: boolean; reason?: string }> {
  try {
    // 1. Cross-Origin and Cross-Site Anti-Spam Check
    const secFetchSite = request.headers.get('sec-fetch-site');
    if (secFetchSite === 'cross-site') {
      return { success: false, reason: 'cross_site_forbidden' };
    }

    const originHeader = request.headers.get('Origin');
    if (originHeader && !isAllowedOrigin(originHeader)) {
      return { success: false, reason: 'origin_forbidden' };
    }

    const isProd = env.ENVIRONMENT === 'production';
    const rawIp =
      request.headers.get('CF-Connecting-IP') ||
      (!isProd ? request.headers.get('X-Forwarded-For') : null) ||
      '127.0.0.1';
    const clientIp = rawIp.split(',')[0].trim();

    // 2. IPv6 /64 prefix clustering rate limit to protect D1 write quota
    const rateLimitKey = normalizeClientIp(clientIp);
    if (isRateLimited(rateLimitKey)) {
      return { success: false, reason: 'rate_limited' };
    }

    // 3. Extract Cloudflare Edge Geo
    const cf = (request as any).cf || {};
    const country = typeof cf.country === 'string' ? cf.country.slice(0, 8) : 'UNKNOWN';
    const city = typeof cf.city === 'string' ? cf.city.slice(0, 64) : '';
    const userAgent = (request.headers.get('User-Agent') || '').slice(0, 512);

    // 4. Normalize & sanitize payload
    const siteId = (payload.siteId || env.SITE_DOMAIN || 'pinteresthd.lave.fun').slice(0, 64);
    const eventType = payload.type === 'download' ? 'download' : payload.type === 'parse' ? 'parse' : 'visit';
    const actionDetail = (payload.action || '').slice(0, 64);
    const metaInfo = JSON.stringify({
      pinId: (payload.pinId || '').slice(0, 64),
      filename: (payload.filename || '').slice(0, 128),
      ...(payload.meta || {})
    }).slice(0, 512);

    const tableName = getTelemetryTableName(env, siteId);

    // 5. Parameterized SQL insert into Cloudflare D1
    if (env.DB && typeof env.DB.prepare === 'function') {
      await env.DB.prepare(`
        INSERT INTO ${tableName} (site_id, ip, country, city, event_type, action_detail, meta_info, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        siteId,
        clientIp,
        country,
        city,
        eventType,
        actionDetail,
        metaInfo,
        userAgent
      ).run();
      return { success: true };
    } else {
      // Dev mode or D1 binding not yet provisioned
      console.log(`[Telemetry][Mock-DB][${tableName}] ${siteId} - ${eventType} - ${actionDetail} from ${clientIp} (${country}/${city})`);
      return { success: true, reason: 'd1_not_bound' };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Telemetry] Ingestion error:', msg);
    return { success: false, reason: msg };
  }
}
