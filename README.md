# Dify Cron

Dify APIを利用して、Googleスプレッドシートでcron設定を管理し、Difyのワークフローを定期実行するGoogle Apps Scriptプロジェクトです。

## 概要

このプロジェクトは以下の機能を提供します：

- Dify APIを使ったアプリケーション一覧の取得
- Googleスプレッドシートを使ったcron設定の管理
- cron形式でのワークフロー実行スケジュール設定
- 定期的なDifyアプリ一覧との同期

## インストール

### 前提条件

- Node.js と npm がインストールされていること
- Google Apps Scriptへのアクセス権があること
- **Google Apps Script API**が有効になっていること
  - 有効化するには [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings) にアクセスし、「Google Apps Script API」をONにしてください
  - API有効化後、反映されるまで数分かかる場合があります

### 手順

1. リポジトリをクローン
   ```
   git clone https://github.com/yourorganization/dify-cron.git
   cd dify-cron
   ```

2. 依存パッケージのインストール
   ```
   npm install
   ```

3. claspでログイン
   ```
   npm run clasp:login
   ```

4. Google Apps Scriptプロジェクトを作成
   ```
   npm run clasp:create
   ```

5. プロジェクトをデプロイ
   ```
   npm run clasp:push
   ```

6. デプロイバージョンを作成
   ```
   npm run clasp:deploy
   ```

7. GASプロジェクト設定
   - プロジェクトルートに`appsscript.json`ファイルを作成（テンプレートとしての`appsscript.json.sample`をコピー）
   - 必要に応じてタイムゾーンなどを調整（日本の場合は`"timeZone": "Asia/Tokyo"`）

## 設定

1. Google Apps Scriptプロジェクトでスクリプトプロパティを設定
   - `DIFY_BASE_URL`: DifyのAPIベースURL
   - `DIFY_USERNAME`: DifyのAPIアクセス用ユーザー名
   - `DIFY_PASSWORD`: DifyのAPIアクセス用パスワード

2. トリガーの設定
   - `syncDifyApps`関数のトリガーを設定（1時間ごとなど）
   - `checkAndRunCronJobs`関数のトリガーを設定（1分ごと）

## 使用方法

### 初期セットアップ

1. Google Apps ScriptエディタでプロジェクトをGoogleスプレッドシートに紐づけます
2. `syncDifyApps`関数を実行して、Difyのアプリ一覧をスプレッドシートに同期します
3. スプレッドシート上でcron設定を行います
   - `Enabled`列のチェックボックスをONにすると、そのアプリがcron実行の対象になります
   - cron形式（分、時、日、月、曜日）で実行スケジュールを設定します

### APIキーの設定

ワークフローを実行するには、各アプリのAPIキーをスプレッドシートに設定する必要があります：

1. Difyの各アプリの「ワークフローアプリAPI」画面でAPIキーを発行します
2. スプレッドシートのAPI Secret列に発行したAPIキーを入力します

### スプレッドシートの列構成

- `Enabled`: 実行対象にするかどうかのチェックボックス（デフォルトはfalse）
- `ID`: アプリID（自動設定）
- `Name`: アプリ名（自動設定）
- `Description`: 説明（自動設定）
- `API Secret`: APIシークレットキー（アプリごとに設定）
- `Cron Minutes`: 分（0-59）
- `Cron Hours`: 時（0-23）
- `Cron Day of Month`: 日（1-31）
- `Cron Month`: 月（1-12）
- `Cron Day of Week`: 曜日（0-6、0=日曜）
- `Args`: JSON形式の引数
- `Last Sync`: 最終同期日時
- `Last Run`: 最終実行日時

### Cron記法

cron設定は標準的な5つのフィールド（分、時、日、月、曜日）で構成されます。

- `*`: すべての値（毎分、毎時など）
- `5`: 特定の値（5分、5時など）
- `1-5`: 範囲（1分から5分、1時から5時など）
- `*/15`: 間隔（15分ごと、15時間ごとなど）
- `5,10,15`: リスト（5分、10分、15分など）

例：
- `30 9 * * 1-5`: 平日（月〜金）の9:30に実行
- `0 */2 * * *`: 2時間おきに実行（0時、2時、4時...）
- `0 0 1 * *`: 毎月1日の0:00に実行

## 主要機能

### Difyアプリ同期

`syncDifyApps`関数はDify APIからアプリ一覧を取得し、スプレッドシートと同期します。
- 新規アプリはスプレッドシートに追加されます（デフォルトでは無効状態）
- 既存アプリの名前や説明が更新されます（Enabled状態やcron設定は保持）
- Difyで削除されたアプリはスプレッドシートからも削除されます

### Cronジョブ実行

`checkAndRunCronJobs`関数は1分ごとに実行され、以下の処理を行います：
- スプレッドシートからEnabled状態のアプリを取得
- 現在時刻がcron設定に合致するかチェック
- 合致した場合、Dify APIを使用してワークフローを実行
- 実行履歴を更新

## 開発

### テスト実行

```
npm test
```

### 継続的テスト実行

```
npm run test:watch
```

### カバレッジレポート生成

```
npm run test:coverage
```

### ビルド

```
npm run build
```

### デプロイ

```
npm run deploy
```

または個別のステップで：

```
# ビルド
npm run build

# GASにプッシュ
npm run clasp:push

# デプロイバージョン作成
npm run clasp:deploy
```

## ライセンス

[MIT License](LICENSE)