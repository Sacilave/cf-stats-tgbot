/**
 * Cloudflare Pages Function - Stealth Telemetry & Web Vitals Ingest
 * Disguised as a standard performance & vitals telemetry endpoint.
 * Returns 204 No Content immediately to avoid blocking client threads.
 */

import { ingestTelemetryEvent } from '../_shared/telemetry/index.ts';
import { TelemetryEnv } from '../_shared/telemetry/types.ts';

export async function onRequestPost(context: {
  request: Request;
  env: TelemetryEnv;
}): Promise<Response> {
  const req = context.request;

  let payload: any = null;
  try {
    const text = await req.text();
    if (text) {
      payload = JSON.parse(text);
    }
  } catch {
    // Silently ignore corrupted bodies
  }

  if (payload && typeof payload === 'object') {
    // Fire and forget: wait for ingestion without holding back response
    context.env.SITE_DOMAIN = context.env.SITE_DOMAIN || 'pinteresthd.lave.fun';
    await ingestTelemetryEvent(req, context.env, payload);
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}
