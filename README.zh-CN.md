# CF-Stats-TGBot ⚡ (简体中文)

<p align="center">
  <strong>Serverless 多站点无感遥测与按需 Telegram 控制台系统</strong>
</p>

<p align="center">
  <a href="#一键安装-prompt">一键安装 Prompt</a> •
  <a href="#核心架构">核心架构</a> •
  <a href="#安全防御与防账单超支">防账单超支</a> •
  <a href="#telegram-指令与控制台">控制台指令</a> •
  <a href="./README.md">English</a>
</p>

---

## ⚡ 一键安装 Prompt (直接发给 AI 助手)

在目标项目的 Chat 窗口中，直接复制发送以下 Prompt 即可一键完成全自动接入：

```markdown
请使用 `cf-stats-tgbot` skill 为当前项目接入 Serverless 遥测与 Telegram 监控系统：

1. 从 `D:\TECH\_Projects\_Skills\cf-stats-tgbot\config.json` 读取全局配置。
2. 识别当前项目域名，计算专属表名（`stats_<site_slug>`），并执行远端 Cloudflare D1 建表。
3. 从模板中无缝复制 `functions/_shared/telemetry/`、`functions/api/vitals.ts` 和 `src/utils/telemetry.ts`。
4. 更新项目 `wrangler.toml` 绑定统一 D1 数据库与必要环境变量。
5. 分析前端业务，定位核心漏斗节点（解析/计算 -> 下载/导出），植入 `trackParse` 与 `trackDownload` 埋点。
6. 执行 `npm run build` 验证构建与类型检查，确保 0 报错。
```

---

## 🏗️ 核心架构

```
  [站点 A: mysite-a.com]          [站点 B: mysite-b.com]          [站点 C: mysite-c.com]
   独立 Worker/Pages 实例          独立 Worker/Pages 实例          独立 Worker/Pages 实例
   /api/vitals (无感埋点)          /api/vitals (无感埋点)          /api/vitals (无感埋点)
             │                               │                               │
             ▼                               ▼                               ▼
    [ stats_mysite_a ]              [ stats_mysite_b ]              [ stats_mysite_c ]
  ─────────────────────────────────────────────────────────────────────────────────────
               统一底层存储：共享同一个 Cloudflare D1 数据库 ("stats")
  ─────────────────────────────────────────────────────────────────────────────────────
                                             ▲
                                             │ 只读数据聚合 (SELECT)
                                             │
                                   [中央 Webhook 路由控制台]
                                   (部署于主控站点)
                                             ▲
                                             │ 交互式指令 (/today, /<site>)
                                             │
                                  [管理员手机 Telegram 客户端]
```

1. **统一 D1 数据库**：所有网站共用同一个 Cloudflare D1 库（`stats`），规避免费账户最多 10 个数据库的配额上限。
2. **表级物理强隔离**：每站只向自己的独立表（`stats_<site_slug>`）写入，无跨站写锁冲突，单表独立索引。
3. **中央控制台模式**：主站点挂载 Telegram Webhook，新站接入后自动纳入 `/today` 统计大盘，无需修改主控端代码。
4. **前端无感埋点**：通过 `navigator.sendBeacon` 发送至 `/api/vitals`，瞬间返回 `204 No Content`，不阻塞主线程。真实公网 IP 由服务端从 `CF-Connecting-IP` 提取。

---

## 🛡️ 安全防御与防账单超支 (Zero-Overcharge Defense)

1. **彻底摒弃自动定时 Cron**：
   * 严禁设立任何外部定时轮询或 Cron Trigger，从源头杜绝网络失败后死循环疯狂重试打爆 Workers 额度、收到上千美刀账单的风险。
2. **100% 被动响应式架构**：
   * 只有管理员在 Telegram 中手动发送指令时，Worker 和 D1 才会执行一次极速只读聚合（耗时 < 50ms）。不点击时资源消耗**恒为 0**。
3. **非阻塞极速回包 (`context.waitUntil`)**：
   * Webhook 接收到消息后在 50ms 内直接返回 HTTP `200`，数据聚合和消息发送在后台异步处理。
   * 彻底杜绝因 Telegram 5 秒超时而发起的重试风暴。
4. **双重合法性防护**：
   * 校验 Telegram 官方 `X-Telegram-Bot-Api-Secret-Token` 请求头。
   * 严格限定仅响应配置的数字管理员 `TG_CHAT_ID`，陌生人消息直接静默丢弃。
5. **内存级防抖频控**：
   * 单指令 5 秒防抖冷却，防止误触双击造成 D1 配额浪费。

---

## 📱 Telegram 指令与控制台

| 指令 | 级别 | 展现内容与周期 |
| :--- | :--- | :--- |
| **`/today`** 或 **`/all`** | 🌐 全矩阵大盘 | 自动扫描 D1 中的所有 `stats_*` 表，输出过去 7 天累计总流量大盘与各站明细。 |
| **`/<site_slug>`** (如 `/pinteresthd`) | 📌 单站深度穿透 | 单站**今日 (24h) / 近 7 天 (周) / 近 30 天 (月)**三周期同屏对比 + Top 15 下载 IP 清单。 |
| **`/help`** 或 **`/menu`** | 📖 指令帮助 | 动态列出当前 D1 数据库中已纳管的所有活跃站点及指令。 |

---

## 🔒 配置与私有凭证管理

为了避免每次使用 Skill 都重复输入敏感凭据，配置安全保存在本地私有文件 `config.json` 中：

```json
{
  "d1": {
    "database_name": "stats",
    "database_id": "YOUR_CLOUDFLARE_D1_DATABASE_UUID"
  },
  "telegram": {
    "bot_token": "YOUR_TELEGRAM_BOT_TOKEN_FROM_BOTFATHER",
    "admin_chat_id": "YOUR_NUMERIC_TELEGRAM_USER_ID",
    "webhook_secret": "YOUR_RANDOM_SECRET_TOKEN_FOR_WEBHOOK"
  },
  "master_site": {
    "domain": "your-master-site.example.com",
    "webhook_path": "/api/telegram-webhook"
  },
  "defaults": {
    "log_retention_days": 30,
    "environment": "production"
  }
}
```

> ⚠️ `config.json` 已被 `.gitignore` 严格忽略，绝不可提交到公开仓库。公开展示请使用 `config.example.json`。

---

## 📄 开源许可证

MIT License © 2026 Sacilave. 专为现代化 Serverless Web 应用打造。
