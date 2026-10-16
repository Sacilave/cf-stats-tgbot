/**
 * Client Telemetry Tracker
 * Designed to be completely stealthy, non-blocking, and reusable across multiple sites.
 * Uses navigator.sendBeacon where available to ensure zero impact on download performance.
 */

interface TrackDownloadOptions {
  pinId?: string;
  filename?: string;
  meta?: Record<string, any>;
}

export function trackDownload(action: string, options?: TrackDownloadOptions): void {
  sendBeaconTelemetry({
    type: 'download',
    action: action || '4x_png',
    pinId: options?.pinId,
    filename: options?.filename,
    meta: options?.meta
  });
}

export function trackParse(pinId?: string, meta?: Record<string, any>): void {
  sendBeaconTelemetry({
    type: 'parse',
    action: 'pin_parsed',
    pinId,
    meta
  });
}

function sendBeaconTelemetry(payload: {
  type: 'parse' | 'download' | 'visit';
  action?: string;
  pinId?: string;
  filename?: string;
  meta?: Record<string, any>;
}): void {
  try {
    const data = JSON.stringify({
      ...payload,
      t: Date.now()
    });

    const endpoint = '/api/vitals';

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    } else if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(() => {
        // Silently ignore any client network error
      });
    }
  } catch {
    // Fail silently to avoid breaking any user functionality
  }
}
