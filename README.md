# Dify API統合システム

Google Apps Script（GAS）を使用してDify APIと統合し、アプリケーション一覧の管理とワークフローの自動実行を行うシステムです。

## 機能

- アプリケーション一覧の取得とスプレッドシートへの出力
- スケジュールされたワークフローの自動実行

## セットアップ

1. 依存パッケージのインストール：
```bash
npm install
```

2. Google Apps Scriptのプロジェクト設定：

以下のスクリプトプロパティを設定してください：
- `DIFY_BASE_URL`: Dify APIのベースURL
- `DIFY_USERNAME`: Difyのユーザー名
- `DIFY_PASSWORD`: Difyのパスワード

3. claspの設定：

新規プロジェクトの場合：
```bash
npm run clasp:login
npm run clasp:create
```

既存プロジェクトの場合は`.clasp.json`を作成：
```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "./src"
}
```

## 開発コマンド

```bash
# ビルド
npm run build

# テスト
npm test                  # 単体テスト
npm run test:watch        # テストの監視実行
npm run test:coverage     # カバレッジレポート

# デプロイ
npm run clasp:push       # コードのプッシュ
npm run clasp:deploy     # デプロイバージョンの作成
```

## 使用方法

1. スプレッドシートの作成
   - `fetchAndCreateSpreadsheet`関数を実行してDifyアプリケーション一覧のスプレッドシートを作成

2. ワークフローの設定（オプション）
   - スプレッドシートにワークフローの実行スケジュールと引数を設定
   - スケジュール形式: "HH:MM"（例: "10:00"）
   - 引数: JSON形式

3. 自動実行の設定（オプション）
   - GASのトリガーで`executeScheduledWorkflows`関数を定期実行するよう設定

## 注意事項

- APIキーやパスワードは必ずスクリプトプロパティとして設定
- Dify APIの利用制限に注意

## ライセンス

ISC