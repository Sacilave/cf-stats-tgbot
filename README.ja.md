# CF-Stats-TGBot ⚡ (日本語ドキュメント)

<p align="center">
  <strong>サーバーレス・マルチサイト テレメトリ ＆ オンデマンド Telegram コンソール</strong>
</p>

<p align="center">
  <a href="#クイックインストールプロンプト">インストールプロンプト</a> •
  <a href="#基本アーキテクチャ">アーキテクチャ</a> •
  <a href="#課金爆発防止セキュリティ">安全設計</a> •
  <a href="#telegram-コマンド">コマンド一覧</a> •
  <a href="./README.md">English</a>
</p>

---

## ⚡ クイックインストール・プロンプト

対象プロジェクトの AI チャット（Antigravity / Claude / Cursor）に直接貼り付けて実行できます：

```markdown
`cf-stats-tgbot` スキルを使用して、このプロジェクトにサーバーレス テレメトリおよび Telegram レポート コンソールを統合してください：

1. `D:\TECH\_Projects\_Skills\cf-stats-tgbot\config.json` から設定を読み込む。
2. ドメイン名を特定し、テーブル名（`stats_<site_slug>`）を決定してリモート Cloudflare D1 にテーブルを作成。
3. `functions/_shared/telemetry/`、`functions/api/vitals.ts`、`src/utils/telemetry.ts` をテンプレートから配置。
4. `wrangler.toml` に D1 データベース バインディングおよび環境変数を設定。
5. フロントエンドの重要アクション（解析/計算 -> ダウンロード/エクスポート）を特定し、`trackParse` と `trackDownload` を実装。
6. `npm run build` を実行してエラーが 0 であることを確認。
```

---

## 🏗️ 基本アーキテクチャ

1. **D1 データベース共有**: Cloudflare の無料枠（最大10データベース）を節約するため、全サイトで単一の D1 (`stats`) を共有。
2. **テーブルレベルの完全分離**: 各サイトは固有のテーブル（`stats_<site_slug>`）にのみ書き込み、ロック競合やデータ混在を防止。
3. **中央 Webhook コンソール**: マスターサイトが Telegram Webhook をホスト。新サイト追加時もマスター側のコード修正は不要。
4. **ステルス計測**: `/api/vitals` は `204 No Content` を即時返却。ユーザー体験やスレッドをブロックしません。

---

## 🛡️ 課金爆発防止セキュリティ (Zero-Overcharge Defense)

1. **自動 Cron の完全廃止**: 外部の定期実行スクリプトやリトライループを排除し、Cloudflare Workers クォータ枯渇による高額請求リスクをゼロに。
2. **100% オンデマンド実行**: 管理者が Telegram でコマンドを送信した時のみ高速に集計（実行時間 < 50ms）。平常時のリソース消費はゼロです。
3. **非ブロッキング高速応答 (`context.waitUntil`)**: Webhook は Telegram に 50ms 以内で HTTP 200 を返却し、集計処理をバックグラウンドで実行。タイムアウトによるリトライスパムを防ぎます。
4. **二重認証ガード**: Telegram 公式のシークレットトークン検証および管理者 `TG_CHAT_ID` ホワイトリスト検証。

---

## 📱 Telegram コマンド

| コマンド | 対象 | 内容 |
| :--- | :--- | :--- |
| **`/today`** または **`/all`** | 🌐 全サイト | D1 内の全テーブルを走査し、直近 7 日間の全体合計およびサイト別推移を表示 |
| **`/<site_slug>`** | 📌 単一サイト | 指定サイトの**今日 (24h) / 過去 7 日 / 過去 30 日**の比較およびダウンロード上位 15 IP |
| **`/help`** | 📖 ヘルプ | 有効なサイトテーブルとコマンド一覧を動的表示 |

---

## 📄 ライセンス

MIT License © 2026 Sacilave.
