# CF-Stats-TGBot ⚡

<p align="center">
  <strong>Serverless Multi-Site Telemetry & On-Demand Telegram Bot Console</strong>
</p>

<p align="center">
  <a href="#quick-install-prompt">Quick Install</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#security--anti-overcharge">Anti-Overcharge</a> •
  <a href="#telegram-commands">Commands</a> •
  <a href="#multilingual-docs">Multilingual Docs</a>
</p>

---

## ⚡ Quick Install Prompt (One-Click Setup)

Copy and paste this prompt directly into your AI coding assistant (Antigravity / Claude / Cursor) within your target project:

```markdown
Please use the `cf-stats-tgbot` skill to integrate serverless telemetry and the Telegram reporting console into this project:

1. Read the global configuration from `D:\TECH\_Projects\_Skills\cf-stats-tgbot\config.json`.
2. Inspect the project domain, determine the table name (`stats_<site_slug>`), and execute remote D1 table creation.
3. Scaffold `functions/_shared/telemetry/`, `functions/api/vitals.ts`, and `src/utils/telemetry.ts` from templates.
4. Update `wrangler.toml` with the D1 database binding and environment variables.
5. Identify core conversion actions (parse/calculate -> download/export) and instrument `trackParse` and `trackDownload`.
6. Verify with `npm run build` to ensure zero compilation errors.
```

---

## 🌐 Multilingual Documentation / 多语言文档

- **English** (Default): Current file below
- **[简体中文 (Simplified Chinese)](./README.zh-CN.md)**
- **[Español (Spanish)](./README.es.md)**
- **[Русский (Russian)](./README.ru.md)**
- **[日本語 (Japanese)](./README.ja.md)**

---

## 🏗️ Architecture & Philosophy

```
  [Site A: mysite-a.com]          [Site B: mysite-b.com]          [Site C: mysite-c.com]
   Worker / Pages Instance         Worker / Pages Instance         Worker / Pages Instance
   /api/vitals (Stealth)           /api/vitals (Stealth)           /api/vitals (Stealth)
             │                               │                               │
             ▼                               ▼                               ▼
    [ stats_mysite_a ]              [ stats_mysite_b ]              [ stats_mysite_c ]
  ─────────────────────────────────────────────────────────────────────────────────────
              Unified Storage: Shared Cloudflare D1 Database ("stats")
  ─────────────────────────────────────────────────────────────────────────────────────
                                             ▲
                                             │ Read-Only Analytics (SELECT)
                                             │
                                   [Master Telegram Webhook]
                                   (Central Console Router)
                                             ▲
                                             │ Interactive Commands (/today, /<site>)
                                             │
                                  [Admin Telegram Client]
```

1. **Shared D1 Database**: Keeps all site tables in a single D1 database (`stats`) to preserve Cloudflare's 10-database free tier limit.
2. **Physical Table Isolation**: Each site writes only to its own table (`stats_<site_slug>`). Zero cross-site write contention, independent indexing.
3. **Central Webhook Console**: One master site hosts the Telegram Webhook router. New sites automatically appear in `/today` without updating master router code.
4. **Stealth Event Ingest**: Client calls `/api/vitals` via `navigator.sendBeacon`. Returns `204 No Content` immediately. Client IPs are extracted server-side via `CF-Connecting-IP`.

---

## 🛡️ Security & Zero-Overcharge Defense

1. **Zero Automated Cron Triggers**:
   - Completely removes automated cron jobs and periodic external curl calls.
   - Eliminates unexpected retry loops and runaway polling bills that can exhaust Workers quotas.
2. **100% Passive Response**:
   - Worker and D1 queries consume resources **only** when the authorized admin manually sends a command in Telegram.
3. **Non-Blocking Fast Webhook ACK (`waitUntil`)**:
   - Webhook returns HTTP `200` to Telegram in `<50ms`, executing database queries asynchronously.
   - Prevents Telegram from triggering 5-second timeout retry storms.
4. **Dual Authentication Barriers**:
   - Validates `X-Telegram-Bot-Api-Secret-Token` header.
   - Strictly enforces numeric admin `TG_CHAT_ID` whitelist. Unauthorized messages are silently dropped.
5. **Memory-Safe Edge Debounce**:
   - 5-second per-command cooling window prevents accidental double-tap spam from wasting D1 read quotas.
6. **Read-Only Analytics**:
   - Telegram interactive commands perform strictly read-only SQL aggregations and never alter database records.

---

## 📱 Telegram Commands & Interactive Menu

| Command | Scope | Report Content |
| :--- | :--- | :--- |
| **`/today`** or **`/all`** | 🌐 All Sites Matrix | 7-day total conversion overview across all registered sites in D1 with per-site breakdown cards. |
| **`/<site_slug>`** (e.g. `/pinteresthd`) | 📌 Single Site Deep Dive | Today (24h) + Past 7 Days + Past 30 Days side-by-side funnel comparison, format preferences, OS/country breakdown, and Top 15 downloader IPs. |
| **`/help`** or **`/menu`** | 📖 Help Center | Interactive guide displaying all dynamically discovered active site tables in D1. |

---

## 📁 Repository Structure

```text
cf-stats-tgbot/
├── SKILL.md                 # Antigravity / Claude Agent Skill specification
├── README.md                # English documentation (this file)
├── README.zh-CN.md          # 简体中文文档
├── README.ja.md             # 日本語ドキュメント
├── config.json              # Local private credentials (Strictly gitignored)
├── config.example.json      # Sanitized template for initial setup
├── .gitignore               # Protects secrets from being committed
├── templates/               # Standardized scaffolding assets
│   ├── telemetry/           # Shared telemetry backend modules (D1, aggregator, formats)
│   ├── vitals.ts            # Stealth Web Vitals ingestion endpoint
│   ├── telemetry.client.ts  # Lightweight client SDK (trackParse, trackDownload)
│   └── telegram-webhook.ts  # Master central Webhook console router (waitUntil hardened)
└── references/              # Architecture and security notes
```

---

## 🔒 Configuration & Secrets Management

To avoid entering sensitive tokens on every skill invocation, credentials are saved locally in `config.json`:

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

> ⚠️ `config.json` is protected by `.gitignore` and must never be committed to public repositories.

---

## 📄 License

MIT License © 2026 Sacilave. Built with ❤️ for serverless web applications.
