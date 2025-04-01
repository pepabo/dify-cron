/**
 * Dify API認証レスポンスの型定義
 */
export interface DifyAuthResponse {
  readonly token: string;
}

/**
 * Difyアプリケーションの型定義
 */
export interface DifyApp {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Difyアプリケーション一覧レスポンスの型定義
 */
export interface DifyAppsResponse {
  readonly data: readonly DifyApp[];
}

/**
 * Dify APIの設定オプションの型定義
 */
export interface DifyConfig {
  readonly baseUrl: string;
  readonly username: string; // Difyのメールアドレス
  readonly password: string;
}

/**
 * スプレッドシートの列定義
 */
// Google Apps Scriptではグローバル変数として宣言
declare global {
  // グローバル変数として宣言
  var SHEET_COLUMNS: {
    readonly Enabled: 'Enabled';
    readonly ID: 'ID';
    readonly Name: 'Name';
    readonly Description: 'Description';
    readonly APISecret: 'API Secret';
    readonly CronMinutes: 'Cron Minutes';
    readonly CronHours: 'Cron Hours';
    readonly CronDayOfMonth: 'Cron Day of Month';
    readonly CronMonth: 'Cron Month';
    readonly CronDayOfWeek: 'Cron Day of Week';
    readonly Args: 'Args';
    readonly LastSync: 'Last Sync';
    readonly LastRun: 'Last Run';
  };
}

// スクリプト実行時にグローバルに設定
globalThis.SHEET_COLUMNS = {
  Enabled: 'Enabled',
  ID: 'ID',
  Name: 'Name',
  Description: 'Description',
  APISecret: 'API Secret',
  CronMinutes: 'Cron Minutes',
  CronHours: 'Cron Hours',
  CronDayOfMonth: 'Cron Day of Month',
  CronMonth: 'Cron Month',
  CronDayOfWeek: 'Cron Day of Week',
  Args: 'Args',
  LastSync: 'Last Sync',
  LastRun: 'Last Run',
};

// TypeScriptのために型付きエクスポート
export const SheetColumns = globalThis.SHEET_COLUMNS;

export type SheetColumnKey = keyof typeof SheetColumns;
export type SheetColumnValue = (typeof SheetColumns)[SheetColumnKey];

/**
 * ワークフロー設定の型定義
 */
export interface WorkflowConfig {
  readonly appId: string;
  readonly schedule: string;
  readonly args: Record<string, unknown>;
}

/**
 * スプレッドシートの行データの型定義
 */
export interface AppRow {
  enabled: boolean;
  id: string;
  name: string;
  description: string;
  apiSecret: string;
  cronMinutes: string;
  cronHours: string;
  cronDayOfMonth: string;
  cronMonth: string;
  cronDayOfWeek: string;
  args: string;
  lastSync: string;
  lastRun: string;
}

/**
 * HTTPレスポンスの型定義
 */
export interface HTTPResponse {
  readonly getResponseCode: () => number;
  readonly getContentText: () => string;
}

/**
 * APIエラーの型定義
 */
export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}
