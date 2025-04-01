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
  readonly username: string;
  readonly password: string;
}

/**
 * スプレッドシートの列定義
 */
export const SheetColumns = {
  ID: 'ID',
  Name: 'Name',
  Description: 'Description',
  Schedule: 'Schedule',
  Args: 'Args',
} as const;

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
    public readonly response: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}
