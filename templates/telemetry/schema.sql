-- ==============================================================================
-- Cloudflare D1 Unified Serverless SQL Database: "stats"
-- Database ID: <YOUR_SHARED_D1_DATABASE_ID>
-- 
-- 架构设计:
-- 1. 单一统一数据库 (stats): 避免消耗 Cloudflare 免费账号的 D1 数据库数量上限 (最多10个)。
-- 2. 每站独立表单 (stats_<site_slug>): 
--    格式: stats_pinteresthd_lave_fun, stats_mysite_com 等。
--    每个表结构完全相同、逻辑强隔离、无跨站锁冲突，支持单表独立30天轮转清理。
-- ==============================================================================

-- 站点: pinteresthd.lave.fun
CREATE TABLE IF NOT EXISTS stats_pinteresthd_lave_fun (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL DEFAULT 'pinteresthd.lave.fun',
    ip TEXT NOT NULL,                          -- 真实客户端 IP (由 CF-Connecting-IP 提取)
    country TEXT DEFAULT 'UNKNOWN',            -- Cloudflare 国家代码 (如 US, CN, JP)
    city TEXT DEFAULT '',                      -- Cloudflare 城市 (如 Tokyo, Beijing)
    event_type TEXT NOT NULL,                  -- 'parse', 'download', 'visit'
    action_detail TEXT DEFAULT '',             -- e.g. '4x_png', 'webp', 'layer_zip', 'batch_zip'
    meta_info TEXT DEFAULT '',                 -- 关联 Pin ID 或元信息
    user_agent TEXT DEFAULT '',                -- 设备与浏览器标识
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 高性能联合索引
CREATE INDEX IF NOT EXISTS idx_phd_created ON stats_pinteresthd_lave_fun(created_at);
CREATE INDEX IF NOT EXISTS idx_phd_event ON stats_pinteresthd_lave_fun(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_phd_ip ON stats_pinteresthd_lave_fun(ip, created_at);

-- ==============================================================================
-- 【其他新网站模板】复制下方代码，把 <SITE_SLUG> 替换为你的新网站域名标识即可:
-- 例如: stats_my_new_tool
-- ==============================================================================
/*
CREATE TABLE IF NOT EXISTS stats_<SITE_SLUG> (
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

CREATE INDEX IF NOT EXISTS idx_<SITE_SLUG>_created ON stats_<SITE_SLUG>(created_at);
CREATE INDEX IF NOT EXISTS idx_<SITE_SLUG>_event ON stats_<SITE_SLUG>(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_<SITE_SLUG>_ip ON stats_<SITE_SLUG>(ip, created_at);
*/
