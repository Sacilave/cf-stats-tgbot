/**
 * Multi-Site Telemetry & Reporting Types
 * Designed for high decoupling, multi-site tenant support, and Cloudflare Edge performance.
 */

export interface TelemetryEnv {
  DB?: any; // Cloudflare D1 Database binding
  TG_BOT_TOKEN?: string; // Telegram Bot Token (from @BotFather)
  TG_CHAT_ID?: string; // Telegram Chat ID (from @userinfobot)
  TG_WEBHOOK_SECRET?: string; // Secret token for validating Telegram Webhook calls
  SITE_DOMAIN?: string;
  TELEMETRY_TABLE?: string; // Dedicated table name for this site, e.g. stats_pinteresthd_lave_fun
  ENVIRONMENT?: string;
}

export type TelemetryEventType = 'parse' | 'download' | 'visit' | 'error';

export interface IngestPayload {
  siteId?: string;
  type: TelemetryEventType;
  action?: string; // e.g. '4x_png', 'webp', 'layer_zip', 'batch_zip'
  pinId?: string;
  filename?: string;
  meta?: Record<string, any>;
  t?: number;
}

export interface TelemetryRecord {
  id: number;
  site_id: string;
  ip: string;
  country: string;
  city: string;
  event_type: TelemetryEventType;
  action_detail: string;
  meta_info: string;
  user_agent: string;
  created_at: string;
}

export interface PeriodMetrics {
  parseCount: number;
  parseUniqueIps: number;
  downloadCount: number;
  downloadUniqueIps: number;
  conversionRate: number; // percentage (0 - 100)
}

export interface MultiPeriodReportSummary {
  siteId: string;
  queryTimeStr: string;
  day: PeriodMetrics;
  week: PeriodMetrics;
  month: PeriodMetrics;
  formats: {
    format: string;
    count: number;
    percentage: number;
  }[];
  devices: {
    mobile: number;
    desktop: number;
    ios: number;
    android: number;
    windows: number;
    mac: number;
    other: number;
  };
  topCountries: {
    country: string;
    count: number;
    percentage: number;
  }[];
  topIps: {
    ip: string;
    maskedIp: string;
    country: string;
    city: string;
    downloadCount: number;
    preferredFormats: string[];
  }[];
  remainingUniqueIpsCount: number;
  remainingDownloadsCount: number;
}

export interface SiteWeeklyOverview {
  siteId: string;
  tableName: string;
  parseCount: number;
  parseUniqueIps: number;
  downloadCount: number;
  downloadUniqueIps: number;
  conversionRate: number;
  topAction?: string;
}

export interface AllSitesOverviewSummary {
  queryTimeStr: string;
  totalSites: number;
  totalParseCount: number;
  totalDownloadCount: number;
  totalUniqueDownloadIps: number;
  overallConversionRate: number;
  sites: SiteWeeklyOverview[];
}

// Deprecated alias for backwards compatibility
export type DailyReportSummary = MultiPeriodReportSummary;
