---
name: cf-stats-tgbot
description: "Cloudflare D1 and Telegram Bot telemetry system for web apps. Enables passive, multi-site traffic monitoring (funnels, downloads, geo, devices) with interactive Telegram reports (/today for 7-day matrix overview, /<site> for deep audits)."
user-invocable: true
argument-hint: "[site-domain] [table-name]"
metadata:
  author: Sacilave
  version: "1.1.0"
  category: analytics
---

# CF-Stats-TGBot: Multi-Site Telemetry & Telegram Console Skill

Autonomous skill to integrate a zero-cost, anti-overcharge stealth telemetry pipeline into any Cloudflare Pages / Workers project with on-demand Telegram Bot reporting.

---

## 0. Global Configuration Discovery (Zero-Prompt Setup)

To ensure **absolute privacy and zero repetitive manual entry**, this skill reads global credentials from the local configuration file:
`D:\TECH\_Projects\_Skills\cf-stats-tgbot\config.json` (fallback: `config.example.json`).

### Priority Credentials
* `d1.database_name`: Shared D1 Database Name (e.g., `stats`).
* `d1.database_id`: Shared D1 Database UUID.
* `telegram.bot_token`: Telegram Bot API Token.
* `telegram.admin_chat_id`: Authorized Admin Telegram User/Chat ID (numeric).
* `telegram.webhook_secret`: Telegram Webhook Secret Token.
* `master_site.domain`: The master domain hosting the central Webhook router.

> [!IMPORTANT]
> Never hardcode Telegram tokens or database credentials into public repositories. Always inject them from `config.json` into local deployment configs.

---

## 1. Architectural Invariants

1. **Unified D1 Database**: All sites share the same D1 database (`stats`) to preserve Cloudflare's 10-database free tier limit.
2. **Table-Level Physical Isolation**: Each site writes only to its own table (`stats_<site_slug>`).
3. **100% Passive Response Architecture (Zero-Overcharge Defense)**:
   - **No Automated Cron Triggers**: Completely eliminates the risk of external retry storms or runaway polling loops.
   - **On-Demand Telegram Menu / Commands**: Resources are consumed *only* when the admin explicitly sends an interactive command.
4. **Fast Non-Blocking Webhook (Anti-Retry Storm)**:
   - Master Webhook returns HTTP `200` immediately to Telegram, processing SQL aggregation asynchronously via `context.waitUntil()`.
5. **Dynamic Site Auto-Discovery**:
   - Master Webhook automatically matches any `/<slug>` against D1 tables. Adding a new site never requires editing the master router code.
6. **Dual-Layer Reporting Matrix**:
   - `/today` (or `/all`): Dynamic multi-site 7-day overview scanning all `stats_*` tables in D1.
   - `/<slug>`: Single-site deep audit with 3-timeframe funnel (Today / 7-Day / 30-Day) + Top 15 downloader IPs.

---

## 2. Standard Integration Workflow (Step-by-Step)

When running this skill on a project repository, execute these 5 steps in sequence:

### Step 1: Detect Project Domain & Derive Table Name
1. Inspect `wrangler.toml`, `package.json`, or environment files to identify the project's production domain (e.g. `mysite.lave.fun`).
2. Derive the standardized SQL table name:
   - Rule: Replace all non-alphanumeric characters with `_`, prepend `stats_`.
   - Example: `vibeinspect.lave.fun` -> `stats_vibeinspect_lave_fun`.
   - Example: `pinteresthd.lave.fun` -> `stats_pinteresthd_lave_fun`.

### Step 2: Generate & Execute D1 Remote Table Provisioning
1. Generate the table migration SQL using the template:
   ```sql
   CREATE TABLE IF NOT EXISTS <TABLE_NAME> (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       site_id TEXT NOT NULL DEFAULT '<SITE_DOMAIN>',
       ip TEXT NOT NULL,
       country TEXT DEFAULT 'UNKNOWN',
       city TEXT DEFAULT '',
       event_type TEXT NOT NULL,
       action_detail TEXT DEFAULT '',
       meta_info TEXT DEFAULT '',
       user_agent TEXT DEFAULT '',
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   CREATE INDEX IF NOT EXISTS idx_<SLUG>_created ON <TABLE_NAME>(created_at);
   CREATE INDEX IF NOT EXISTS idx_<SLUG>_event ON <TABLE_NAME>(event_type, created_at);
   CREATE INDEX IF NOT EXISTS idx_<SLUG>_ip ON <TABLE_NAME>(ip, created_at);
   ```
2. Execute the remote D1 migration:
   ```bash
   npx wrangler d1 execute <DATABASE_NAME> --command="<SQL>" --remote
   ```

### Step 3: Scaffold Serverless Telemetry Modules
Copy the standard telemetry modules from the skill templates directory (`D:\TECH\_Projects\_Skills\cf-stats-tgbot\templates\`):
1. `templates/telemetry/` -> Target project `functions/_shared/telemetry/`
2. `templates/vitals.ts` -> Target project `functions/api/vitals.ts`
3. `templates/telemetry.client.ts` -> Target project `src/utils/telemetry.ts`

> [!NOTE]
> If the target project has a global `functions/_middleware.ts`, verify that `/api/vitals` is permitted.

### Step 4: Configure Project `wrangler.toml`
Add or update the `[vars]` and `[[d1_databases]]` sections in the target project's `wrangler.toml`:
```toml
[vars]
ENVIRONMENT = "production"
SITE_DOMAIN = "<SITE_DOMAIN>"
TELEMETRY_TABLE = "<TABLE_NAME>"

[[d1_databases]]
binding = "DB"
database_name = "<FROM_CONFIG>"
database_id = "<FROM_CONFIG>"
```

### Step 5: Inject Frontend Telemetry SDK & Instrument Core Actions
1. Inspect frontend code to identify key conversion events:
   - **Conversion Origin (Funnel Top)**: Call `trackParse(resourceId)` upon successful parse, generation, or search query completion.
   - **Conversion Goal (Funnel Bottom)**: Call `trackDownload(format, options)` when the user downloads, exports, or copies the resource.
2. Run project build (`npm run build`) to ensure 100% type safety.

---

## 3. Quality & Safety Verification Checklist

Before finishing execution on any repository:
- [ ] D1 remote table created and verified via `sqlite_master` query.
- [ ] No hardcoded bot tokens committed to public git repos.
- [ ] No external Cron Triggers or periodic retry loops introduced.
- [ ] Ingestion endpoint `/api/vitals` returns `204 No Content`.
- [ ] `npm run build` succeeds with zero TypeScript or packaging errors.
