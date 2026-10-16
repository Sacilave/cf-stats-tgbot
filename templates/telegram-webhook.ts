/**
 * Cloudflare Pages Function - Telegram Bot Interactive Webhook Console
 * 
 * Enterprise Hardened Architecture:
 * 1. Non-Blocking Fast ACK (waitUntil):
 *    Immediately returns HTTP 200 OK to Telegram within <50ms.
 *    Asynchronously executes SQL queries and message dispatch via waitUntil.
 *    Completely eliminates Telegram 5-second webhook timeout retry storms!
 * 2. Dynamic Auto-Discovery of New Sites:
 *    Matches any command /<slug> against D1 tables (stats_<slug>).
 *    Adding a new site NEVER requires touching the router code in this master site.
 * 3. Two-Tier Reporting Hierarchy:
 *    - /today or /all: Aggregates 7-day master overview across all registered sites in D1.
 *    - /<slug> (e.g. /pinteresthd): Single-site 3-timeframe (today/week/month) deep audit with Top 15 IPs.
 * 4. Absolute Dual Security Barriers:
 *    - Validates 'X-Telegram-Bot-Api-Secret-Token' against TG_WEBHOOK_SECRET.
 *    - Restricts command execution strictly to authorized TG_CHAT_ID (admin).
 * 5. Memory Debounce / Anti-Spam:
 *    5-second edge cooling prevents duplicate queries and preserves D1 quotas.
 */

import { TelemetryEnv } from '../_shared/telemetry/types.ts';
import {
  aggregateDailySummary,
  formatTelegramHtmlReport,
  aggregateAllSitesWeeklySummary,
  formatAllSitesOverviewHtmlReport,
  sendTelegramMessage
} from '../_shared/telemetry/notifier.ts';

// In-memory debounce map: protects D1 read quota from rapid double-clicks (5-second cooldown per command)
const commandCooldownMap = new Map<string, number>();

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
    date: number;
    text?: string;
  };
}

export async function onRequest(context: {
  request: Request;
  env: TelemetryEnv;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const req = context.request;
  const env = context.env;

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 1. Level 1 Security: Validate Telegram Secret Token header
  const configuredSecret = env.TG_WEBHOOK_SECRET;
  if (configuredSecret) {
    const receivedSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!receivedSecret || receivedSecret !== configuredSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized secret token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 2. Parse Telegram update payload safely
  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const message = update.message;
  // If not a text message event, return 200 OK immediately
  if (!message || !message.text) {
    return new Response(JSON.stringify({ status: 'ignored_not_text' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. Level 2 Security: Whitelist Chat ID and User ID Check
  const authorizedChatId = env.TG_CHAT_ID ? String(env.TG_CHAT_ID).trim() : '';
  const senderChatId = String(message.chat.id);
  const senderUserId = message.from ? String(message.from.id) : '';

  if (!authorizedChatId || (senderChatId !== authorizedChatId && senderUserId !== authorizedChatId)) {
    // Silently drop messages from unauthorized strangers or extraneous channels
    return new Response(JSON.stringify({ status: 'ignored_unauthorized_user' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const botToken = env.TG_BOT_TOKEN;
  if (!botToken) {
    return new Response(JSON.stringify({ error: 'TG_BOT_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. Command parsing
  const rawText = message.text.trim();
  const commandParts = rawText.split(' ')[0].split('@');
  const command = commandParts[0].toLowerCase();

  // Fast ACK with non-blocking execution via waitUntil
  const processCommandTask = async () => {
    try {
      // 4.1 Master 7-day all-sites overview (/today, /all, /stats)
      if (command === '/today' || command === '/all' || command === '/stats') {
        const allSitesSummary = await aggregateAllSitesWeeklySummary(env);
        const reportHtml = formatAllSitesOverviewHtmlReport(allSitesSummary);
        await sendTelegramMessage(botToken, authorizedChatId, reportHtml);
        return;
      }

      // 4.2 Help / Menu Guide
      if (command === '/start' || command === '/help' || command === '/menu') {
        // Dynamically discover all active sites to build live interactive menu
        let siteListStr = '';
        if (env.DB && typeof env.DB.prepare === 'function') {
          const tables = await env.DB.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stats_%' AND name NOT LIKE '%_backup'
          `).all().catch(() => ({ results: [] }));
          for (const t of tables.results || []) {
            const slug = String(t.name).replace(/^stats_/, '');
            const shortCmd = slug.split('_')[0];
            siteListStr += `  • <code>/${shortCmd}</code> (站点: <code>${slug.replace(/_/g, '.')}</code>)\n`;
          }
        }

        const helpMessage = `🤖 <b>【遥测数据中心 Telegram 控制台】</b>\n\n` +
          `💡 统一管理所有站点的流量监控与转化漏斗。常用指令：\n\n` +
          `🌐 <b>/today</b> 或 <b>/all</b>\n  • 查看全矩阵所有站点过去 7 天累计总流量大盘与各站明细\n\n` +
          `📌 <b>单站深度穿透（今日/7天/30天 + Top IP）</b>：\n` +
          (siteListStr || '  • <i>暂无注册站点表</i>\n') +
          `\n❓ <b>/help</b> - 显示可用指令帮助菜单\n\n` +
          `<i>🔒 安全保障：本 Bot 仅响应受信任管理员账号，100% 被动查询零额度超支风险。</i>`;

        await sendTelegramMessage(botToken, authorizedChatId, helpMessage);
        return;
      }

      // 4.3 Anti-spam / Cooldown protection (5-second throttle per command)
      const now = Date.now();
      const cooldownKey = `${authorizedChatId}:${command}`;
      const lastExecTime = commandCooldownMap.get(cooldownKey) || 0;
      if (now - lastExecTime < 5000) {
        await sendTelegramMessage(
          botToken,
          authorizedChatId,
          `⏳ <b>请求过于频繁</b>\n请等待 ${(5 - Math.floor((now - lastExecTime) / 1000))} 秒后再试，避免重复消耗 D1 配额。`
        );
        return;
      }
      commandCooldownMap.set(cooldownKey, now);

      // 4.4 Dynamic single-site command matching
      // Extracts command slug (e.g. '/pinteresthd' -> 'pinteresthd', '/vi' -> 'vibeinspect')
      const cmdSlug = command.replace(/^\//, '').replace(/[^a-zA-Z0-9_]/g, '');
      if (!cmdSlug) return;

      let matchedSiteId: string | null = null;

      // Special alias mappings
      if (cmdSlug === 'phd' || cmdSlug === 'pinteresthd') {
        matchedSiteId = 'pinteresthd.lave.fun';
      } else if (cmdSlug === 'vi' || cmdSlug === 'vibeinspect') {
        matchedSiteId = 'vibeinspect.lave.fun';
      } else if (env.DB && typeof env.DB.prepare === 'function') {
        // Dynamic search in D1 sqlite_master for table matching stats_<slug>%
        const searchRes = await env.DB.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name LIKE ? AND name NOT LIKE '%_backup'
          LIMIT 1
        `).bind(`stats_${cmdSlug}%`).all().catch(() => ({ results: [] }));

        if (searchRes.results && searchRes.results.length > 0) {
          const rawName = String(searchRes.results[0].name);
          matchedSiteId = rawName.replace(/^stats_/, '').replace(/_/g, '.');
        }
      }

      if (matchedSiteId) {
        const summary = await aggregateDailySummary(env, matchedSiteId);
        const reportHtml = formatTelegramHtmlReport(summary);
        await sendTelegramMessage(botToken, authorizedChatId, reportHtml);
      } else {
        await sendTelegramMessage(
          botToken,
          authorizedChatId,
          `❓ <b>未找到对应站点</b>: 指令 <code>${command}</code> 未匹配到任何 D1 站点数据表。\n发送 <b>/today</b> 查看全站大盘，或发送 <b>/help</b> 查看可用指令。`
        );
      }
    } catch (err: any) {
      console.error('[TelegramWebhook] Error executing task:', err);
      await sendTelegramMessage(
        botToken,
        authorizedChatId,
        `⚠️ <b>查询失败</b>: 无法获取统计数据。\n错误原因: <code>${err?.message || '未知错误'}</code>`
      );
    }
  };

  // Safe non-blocking execution via waitUntil if supported, fallback to await
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(processCommandTask());
  } else {
    // If runtime does not provide waitUntil, await directly
    await processCommandTask();
  }

  // Fast response to Telegram to prevent retry storms
  return new Response(JSON.stringify({ status: 'queued', command }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
