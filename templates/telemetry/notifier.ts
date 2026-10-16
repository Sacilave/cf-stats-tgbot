/**
 * Reusable Telemetry Report Generator & Telegram Dispatcher
 * Features:
 * - Unified D1 Database with dedicated per-site table isolation (e.g. stats_pinteresthd_lave_fun)
 * - Multi-Timeframe Analytics: Today (24h), Past 7 Days (1 Week), Past 30 Days (1 Month)
 * - Single-pass efficient aggregation queries (Zero wasted D1 quotas)
 * - Aggregates Funnel, Formats, Devices, Geo, and Downloader IPs
 * - Strict display limit on Downloader IPs (Top 15 max) to avoid Telegram character bloat
 * - IP masking for log safety (e.g. 114.249.xx.xx)
 * - Safe HTML formatting for Telegram Bot API (avoids Markdown escaping bugs)
 * - Automated 30-day database pruning utility
 */

import {
  TelemetryEnv,
  MultiPeriodReportSummary,
  PeriodMetrics,
  AllSitesOverviewSummary,
  SiteWeeklyOverview
} from './types.ts';
import { getTelemetryTableName } from './collector.ts';

function maskIp(ip: string): string {
  if (!ip) return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xx.xx`;
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 2).join(':')}:****:****`;
  }
  return ip;
}

function parseDeviceFromUa(ua: string): { os: string; isMobile: boolean } {
  const lower = ua.toLowerCase();
  const isMobile = /mobile|iphone|ipod|android|ipad/.test(lower);
  let os = 'Other';
  if (/iphone|ipad|ipod/.test(lower)) os = 'iOS';
  else if (/android/.test(lower)) os = 'Android';
  else if (/windows/.test(lower)) os = 'Windows';
  else if (/macintosh|mac os x/.test(lower)) os = 'Mac';
  else if (/linux/.test(lower)) os = 'Linux';
  return { os, isMobile };
}

function calcConversionRate(uniqueIps: number, parseUniqueIps: number): number {
  if (parseUniqueIps > 0) {
    return Number(((uniqueIps / parseUniqueIps) * 100).toFixed(1));
  }
  return uniqueIps > 0 ? 100 : 0;
}

export async function aggregateDailySummary(
  env: TelemetryEnv,
  siteId: string
): Promise<MultiPeriodReportSummary> {
  const now = new Date();
  const queryTimeStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  const emptyPeriod = (): PeriodMetrics => ({
    parseCount: 0,
    parseUniqueIps: 0,
    downloadCount: 0,
    downloadUniqueIps: 0,
    conversionRate: 0
  });

  const summary: MultiPeriodReportSummary = {
    siteId,
    queryTimeStr,
    day: emptyPeriod(),
    week: emptyPeriod(),
    month: emptyPeriod(),
    formats: [],
    devices: {
      mobile: 0,
      desktop: 0,
      ios: 0,
      android: 0,
      windows: 0,
      mac: 0,
      other: 0
    },
    topCountries: [],
    topIps: [],
    remainingUniqueIpsCount: 0,
    remainingDownloadsCount: 0
  };

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return summary;
  }

  const tableName = getTelemetryTableName(env, siteId);

  // 1. Efficient Multi-Timeframe Funnel Query (Today / 7-Day / 30-Day in 3 lightweight prepared statements)
  // Day (Past 24 hours)
  const dayRes = await env.DB.prepare(`
    SELECT 
      event_type,
      COUNT(*) as total_events,
      COUNT(DISTINCT ip) as unique_ips
    FROM ${tableName}
    WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY event_type
  `).all().catch(() => ({ results: [] }));

  for (const r of dayRes.results || []) {
    if (r.event_type === 'parse') {
      summary.day.parseCount = Number(r.total_events) || 0;
      summary.day.parseUniqueIps = Number(r.unique_ips) || 0;
    } else if (r.event_type === 'download') {
      summary.day.downloadCount = Number(r.total_events) || 0;
      summary.day.downloadUniqueIps = Number(r.unique_ips) || 0;
    }
  }
  summary.day.conversionRate = calcConversionRate(summary.day.downloadUniqueIps, summary.day.parseUniqueIps);

  // Week (Past 7 days)
  const weekRes = await env.DB.prepare(`
    SELECT 
      event_type,
      COUNT(*) as total_events,
      COUNT(DISTINCT ip) as unique_ips
    FROM ${tableName}
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY event_type
  `).all().catch(() => ({ results: [] }));

  for (const r of weekRes.results || []) {
    if (r.event_type === 'parse') {
      summary.week.parseCount = Number(r.total_events) || 0;
      summary.week.parseUniqueIps = Number(r.unique_ips) || 0;
    } else if (r.event_type === 'download') {
      summary.week.downloadCount = Number(r.total_events) || 0;
      summary.week.downloadUniqueIps = Number(r.unique_ips) || 0;
    }
  }
  summary.week.conversionRate = calcConversionRate(summary.week.downloadUniqueIps, summary.week.parseUniqueIps);

  // Month (Past 30 days)
  const monthRes = await env.DB.prepare(`
    SELECT 
      event_type,
      COUNT(*) as total_events,
      COUNT(DISTINCT ip) as unique_ips
    FROM ${tableName}
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY event_type
  `).all().catch(() => ({ results: [] }));

  for (const r of monthRes.results || []) {
    if (r.event_type === 'parse') {
      summary.month.parseCount = Number(r.total_events) || 0;
      summary.month.parseUniqueIps = Number(r.unique_ips) || 0;
    } else if (r.event_type === 'download') {
      summary.month.downloadCount = Number(r.total_events) || 0;
      summary.month.downloadUniqueIps = Number(r.unique_ips) || 0;
    }
  }
  summary.month.conversionRate = calcConversionRate(summary.month.downloadUniqueIps, summary.month.parseUniqueIps);

  // 2. Format / Feature preferences (Past 7 days for rich trend representation)
  const formatRes = await env.DB.prepare(`
    SELECT 
      action_detail,
      COUNT(*) as count
    FROM ${tableName}
    WHERE event_type = 'download' AND created_at >= datetime('now', '-7 days')
    GROUP BY action_detail
    ORDER BY count DESC
  `).all().catch(() => ({ results: [] }));

  const formatRows = formatRes.results || [];
  const totalDownloadEvents = summary.week.downloadCount || 1;
  summary.formats = formatRows.map((r: any) => ({
    format: r.action_detail || 'Standard PNG',
    count: Number(r.count),
    percentage: Number(((Number(r.count) / totalDownloadEvents) * 100).toFixed(1))
  }));

  // 3. User Agents & Devices (Past 7 days)
  const uaRes = await env.DB.prepare(`
    SELECT user_agent, COUNT(*) as count
    FROM ${tableName}
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY user_agent
  `).all().catch(() => ({ results: [] }));

  for (const r of uaRes.results || []) {
    const count = Number(r.count) || 1;
    const { os, isMobile } = parseDeviceFromUa(r.user_agent || '');
    if (isMobile) summary.devices.mobile += count;
    else summary.devices.desktop += count;

    if (os === 'iOS') summary.devices.ios += count;
    else if (os === 'Android') summary.devices.android += count;
    else if (os === 'Windows') summary.devices.windows += count;
    else if (os === 'Mac') summary.devices.mac += count;
    else summary.devices.other += count;
  }

  // 4. Top Countries (Past 7 days)
  const geoRes = await env.DB.prepare(`
    SELECT country, COUNT(*) as count
    FROM ${tableName}
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY country
    ORDER BY count DESC
    LIMIT 5
  `).all().catch(() => ({ results: [] }));

  const totalGeoEvents = (summary.week.parseCount + summary.week.downloadCount) || 1;
  summary.topCountries = (geoRes.results || []).map((r: any) => ({
    country: r.country || 'UNKNOWN',
    count: Number(r.count),
    percentage: Number(((Number(r.count) / totalGeoEvents) * 100).toFixed(1))
  }));

  // 5. Downloader IPs Audit List (Recent active downloaders, Top 15 strictly capped)
  const ipsRes = await env.DB.prepare(`
    SELECT 
      ip,
      country,
      city,
      COUNT(*) as count,
      GROUP_CONCAT(DISTINCT action_detail) as formats
    FROM ${tableName}
    WHERE event_type = 'download' AND created_at >= datetime('now', '-7 days')
    GROUP BY ip
    ORDER BY count DESC
  `).all().catch(() => ({ results: [] }));

  const allIpRows = ipsRes.results || [];
  const top15 = allIpRows.slice(0, 15);
  const remaining = allIpRows.slice(15);

  summary.topIps = top15.map((r: any) => ({
    ip: r.ip,
    maskedIp: maskIp(r.ip),
    country: r.country || 'UNKNOWN',
    city: r.city || '',
    downloadCount: Number(r.count),
    preferredFormats: (r.formats || '').split(',').filter(Boolean)
  }));

  summary.remainingUniqueIpsCount = remaining.length;
  summary.remainingDownloadsCount = remaining.reduce((acc: number, cur: any) => acc + (Number(cur.count) || 0), 0);

  return summary;
}

export function formatTelegramHtmlReport(summary: MultiPeriodReportSummary): string {
  const {
    siteId,
    queryTimeStr,
    day,
    week,
    month,
    formats,
    devices,
    topCountries,
    topIps,
    remainingUniqueIpsCount,
    remainingDownloadsCount
  } = summary;

  const totalDeviceCount = (devices.mobile + devices.desktop) || 1;
  const mobilePct = ((devices.mobile / totalDeviceCount) * 100).toFixed(0);
  const desktopPct = ((devices.desktop / totalDeviceCount) * 100).toFixed(0);

  let msg = `⚡ <b>【站点流量综合运营战报】</b>\n`;
  msg += `🏷️ 站点标识: <code>${siteId}</code>\n`;
  msg += `🕒 查询时间: <code>${queryTimeStr}</code>\n\n`;

  // 1. Multi-Timeframe Funnel Metrics
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 <b>1. 流量与转化大盘 (多周期对比)</b>\n\n`;

  // 1.1 今日 (24小时)
  msg += `▫️ <b>今日实时 (过去 24 小时)</b>\n`;
  msg += `  • 解析请求: <b>${day.parseCount}</b> 次 (<b>${day.parseUniqueIps}</b> IP)\n`;
  msg += `  • 下载动作: <b>${day.downloadCount}</b> 次 (<b>${day.downloadUniqueIps}</b> IP)\n`;
  msg += `  • 转化效率: <b>${day.conversionRate}%</b>\n\n`;

  // 1.2 近7天 (1周)
  msg += `▫️ <b>近 7 天累计 (周统计)</b>\n`;
  msg += `  • 解析请求: <b>${week.parseCount}</b> 次 (<b>${week.parseUniqueIps}</b> IP)\n`;
  msg += `  • 下载动作: <b>${week.downloadCount}</b> 次 (<b>${week.downloadUniqueIps}</b> IP)\n`;
  msg += `  • 转化效率: <b>${week.conversionRate}%</b>\n\n`;

  // 1.3 近30天 (1个月)
  msg += `▫️ <b>近 30 天累计 (月统计)</b>\n`;
  msg += `  • 解析请求: <b>${month.parseCount}</b> 次 (<b>${month.parseUniqueIps}</b> IP)\n`;
  msg += `  • 下载动作: <b>${month.downloadCount}</b> 次 (<b>${month.downloadUniqueIps}</b> IP)\n`;
  msg += `  • 转化效率: <b>${month.conversionRate}%</b>\n\n`;

  // 2. Feature & Format (7-Day Overview)
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 <b>2. 功能与格式偏好 (近 7 天)</b>\n`;
  if (formats.length === 0) {
    msg += `• 暂无下载事件记录\n\n`;
  } else {
    for (const f of formats) {
      msg += `• ${f.format}: <b>${f.count}</b> 次 (${f.percentage}%)\n`;
    }
    msg += `\n`;
  }

  // 3. Demographics (7-Day Overview)
  msg += `📱 <b>3. 访问终端与地域 (近 7 天)</b>\n`;
  msg += `• 终端分布: 移动端 ${mobilePct}% (iOS ${devices.ios}, Android ${devices.android}) | PC端 ${desktopPct}%\n`;
  if (topCountries.length > 0) {
    const geoStr = topCountries.map(c => `${c.country} ${c.percentage}%`).join(' | ');
    msg += `• 热门地域: ${geoStr}\n\n`;
  } else {
    msg += `\n`;
  }

  // 4. Download IP Audit List (Strictly at the end, Max 15)
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🌐 <b>4. 活跃下载者真实 IP 明细 (Top 15)</b>\n`;
  msg += `<i>(按下载频次降序排列，仅展示高频与代表性 IP)</i>\n`;

  if (topIps.length === 0) {
    msg += `• 近期暂无下载记录\n`;
  } else {
    topIps.forEach((item, idx) => {
      const rank = String(idx + 1).padStart(2, '0');
      const location = item.city ? `${item.country}·${item.city}` : item.country;
      const formatsStr = item.preferredFormats.length > 0 ? ` [${item.preferredFormats.join(', ')}]` : '';
      msg += `${rank}. <code>${item.maskedIp}</code> (${location}) - <b>${item.downloadCount}次</b>${formatsStr}\n`;
    });

    if (remainingUniqueIpsCount > 0) {
      msg += `\n📌 <b>余量汇总</b>: 其余 <b>${remainingUniqueIpsCount}</b> 个独立 IP (共 ${remainingDownloadsCount} 次低频下载) 已归档至数据库。\n`;
    }
  }

  return msg;
}

/**
 * Aggregates 7-day metrics across ALL registered site tables (stats_*) dynamically from D1.
 * Perfect for a high-level master dashboard command (/today or /all).
 */
export async function aggregateAllSitesWeeklySummary(
  env: TelemetryEnv
): Promise<AllSitesOverviewSummary> {
  const now = new Date();
  const queryTimeStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  const summary: AllSitesOverviewSummary = {
    queryTimeStr,
    totalSites: 0,
    totalParseCount: 0,
    totalDownloadCount: 0,
    totalUniqueDownloadIps: 0,
    overallConversionRate: 0,
    sites: []
  };

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return summary;
  }

  // 1. Discover all site tables matching stats_%
  const tablesRes = await env.DB.prepare(`
    SELECT name 
    FROM sqlite_master 
    WHERE type = 'table' AND name LIKE 'stats_%' AND name NOT LIKE '%_backup'
    ORDER BY name ASC
  `).all().catch(() => ({ results: [] }));

  const tableRows = tablesRes.results || [];
  if (tableRows.length === 0) {
    return summary;
  }

  summary.totalSites = tableRows.length;
  let allSitesParseUniqueIpsTotal = 0;

  for (const t of tableRows) {
    const rawTableName = String(t.name);
    // Sanitize table name to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(rawTableName)) continue;

    // Derive siteId from table name (stats_pinteresthd_lave_fun -> pinteresthd.lave.fun)
    const siteSlug = rawTableName.replace(/^stats_/, '');
    const siteDomain = siteSlug.replace(/_/g, '.');

    const siteStat: SiteWeeklyOverview = {
      siteId: siteDomain,
      tableName: rawTableName,
      parseCount: 0,
      parseUniqueIps: 0,
      downloadCount: 0,
      downloadUniqueIps: 0,
      conversionRate: 0
    };

    // Query 7-day funnel metrics for this site
    const funnelRes = await env.DB.prepare(`
      SELECT 
        event_type,
        COUNT(*) as total_events,
        COUNT(DISTINCT ip) as unique_ips
      FROM ${rawTableName}
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY event_type
    `).all().catch(() => ({ results: [] }));

    for (const r of funnelRes.results || []) {
      if (r.event_type === 'parse') {
        siteStat.parseCount = Number(r.total_events) || 0;
        siteStat.parseUniqueIps = Number(r.unique_ips) || 0;
      } else if (r.event_type === 'download') {
        siteStat.downloadCount = Number(r.total_events) || 0;
        siteStat.downloadUniqueIps = Number(r.unique_ips) || 0;
      }
    }
    siteStat.conversionRate = calcConversionRate(siteStat.downloadUniqueIps, siteStat.parseUniqueIps);

    // Query top action/feature for this site
    const topActionRes = await env.DB.prepare(`
      SELECT action_detail, COUNT(*) as count
      FROM ${rawTableName}
      WHERE event_type = 'download' AND created_at >= datetime('now', '-7 days')
      GROUP BY action_detail
      ORDER BY count DESC
      LIMIT 1
    `).all().catch(() => ({ results: [] }));

    if (topActionRes.results && topActionRes.results.length > 0) {
      siteStat.topAction = String(topActionRes.results[0].action_detail || '');
    }

    summary.sites.push(siteStat);
    summary.totalParseCount += siteStat.parseCount;
    summary.totalDownloadCount += siteStat.downloadCount;
    summary.totalUniqueDownloadIps += siteStat.downloadUniqueIps;
    allSitesParseUniqueIpsTotal += siteStat.parseUniqueIps;
  }

  summary.overallConversionRate = calcConversionRate(summary.totalUniqueDownloadIps, allSitesParseUniqueIpsTotal);

  return summary;
}

/**
 * Formats the master multi-site 7-day overview into clean HTML for Telegram.
 */
export function formatAllSitesOverviewHtmlReport(summary: AllSitesOverviewSummary): string {
  const {
    queryTimeStr,
    totalSites,
    totalParseCount,
    totalDownloadCount,
    totalUniqueDownloadIps,
    overallConversionRate,
    sites
  } = summary;

  let msg = `🌐 <b>【全矩阵站点 7 日流量概览大盘】</b>\n`;
  msg += `🕒 统计时间: <code>${queryTimeStr}</code>\n`;
  msg += `📁 纳管站点: <b>${totalSites}</b> 个\n\n`;

  // 1. Overall Totals
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 <b>全站总计 (过去 7 天累计)</b>\n`;
  msg += `• 核心解析总量: <b>${totalParseCount}</b> 次\n`;
  msg += `• 最终下载总量: <b>${totalDownloadCount}</b> 次\n`;
  msg += `• 独立下载人数: <b>${totalUniqueDownloadIps}</b> 个 IP\n`;
  msg += `• 全矩阵转化率: <b>${overallConversionRate}%</b>\n\n`;

  // 2. Per-Site Breakdown Cards
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 <b>各站点 7 日详细表现明细</b>\n\n`;

  if (sites.length === 0) {
    msg += `• 数据库暂无站点表记录\n`;
  } else {
    sites.forEach((s, idx) => {
      const num = idx + 1;
      msg += `<b>${num}. 站点: <code>${s.siteId}</code></b>\n`;
      msg += `  • 解析: <b>${s.parseCount}</b> 次 (<b>${s.parseUniqueIps}</b> IP)\n`;
      msg += `  • 下载: <b>${s.downloadCount}</b> 次 (<b>${s.downloadUniqueIps}</b> IP)\n`;
      msg += `  • 转化: <b>${s.conversionRate}%</b>`;
      if (s.topAction) {
        msg += ` | 热门偏好: <code>${s.topAction}</code>`;
      }
      msg += `\n\n`;
    });
  }

  // 3. Drill-down instructions
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💡 <b>单站多周期深度分析</b>: 发送单站指令（如 <code>/pinteresthd</code> 或 <code>/vibeinspect</code>）可获取该站<b>今日/7天/30天</b>三周期同屏深度战报与 Top 15 下载 IP 清单。`;

  return msg;
}


export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlContent,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { success: false, error: data.description || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function cleanupOldTelemetryLogs(
  env: TelemetryEnv,
  daysToKeep = 30
): Promise<number> {
  if (!env.DB || typeof env.DB.prepare !== 'function') return 0;
  try {
    const tableName = getTelemetryTableName(env);
    const res = await env.DB.prepare(`
      DELETE FROM ${tableName} 
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `).bind(daysToKeep).run();
    return res?.meta?.changes || 0;
  } catch (err) {
    console.warn('[Telemetry] Cleanup error:', err);
    return 0;
  }
}
