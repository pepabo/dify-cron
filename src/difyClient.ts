import type { DifyConfig, DifyApp } from './types';

declare const UrlFetchApp: GoogleAppsScript.URL_Fetch.UrlFetchApp;
declare const Logger: GoogleAppsScript.Base.Logger;

interface DifyResponse {
  token?: string;
  access_token?: string;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Dify APIのエラー
 */
export class DifyAPIError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = 'DifyAPIError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Dify APIクライアント
 */
export class DifyClient {
  readonly #config: DifyConfig;
  #token: string | null = null;

  /**
   * @param {DifyConfig} config 設定
   */
  constructor(config: DifyConfig) {
    this.#config = Object.freeze({ ...config });
  }

  /**
   * APIにリクエストを送信する
   * @param {string} path パス
   * @param {GoogleAppsScript.URL_Fetch.URLFetchRequestOptions} options オプション
   * @returns {DifyResponse} レスポンス
   * @throws {DifyAPIError} APIエラー
   * @private
   */
  #fetch(path: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): DifyResponse {
    const url = `${this.#config.baseUrl}${path}`;
    Logger.log(`Sending API request to: ${url}`);
    Logger.log(`Request options: ${JSON.stringify(options, null, 2)}`);

    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      const responseText = response.getContentText();

      Logger.log(`Response status code: ${statusCode}`);

      if (statusCode < 200 || statusCode >= 300) {
        Logger.log(`Error response: ${responseText}`);
        throw new DifyAPIError(
          `API request failed: ${url} (Status: ${statusCode})`,
          statusCode,
          responseText,
        );
      }

      return JSON.parse(responseText);
    } catch (error) {
      if (error instanceof DifyAPIError) {
        throw error;
      }

      Logger.log(`Fetch error: ${error}`);
      throw new DifyAPIError(`API request error: ${url}`, 500, String(error));
    }
  }

  /**
   * ログインする
   * @returns {Promise<string>} トークン
   * @throws {DifyAPIError} APIエラー
   * @private
   */
  async #login(): Promise<string> {
    const response = this.#fetch('/console/api/login', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        email: this.#config.username,
        password: this.#config.password,
      }),
      muteHttpExceptions: true,
    });

    // レスポンスの詳細をログに出力（デバッグ用）
    Logger.log(`Login response: ${JSON.stringify(response)}`);

    // トークンの取得ロジックを修正
    let token: string | undefined;

    // 1. 直接 token プロパティをチェック
    if (typeof response.token === 'string') {
      token = response.token;
    }
    // 2. access_token を直接チェック
    else if (typeof response.access_token === 'string') {
      token = response.access_token;
    }
    // 3. data.access_token をチェック（Difyの新しいAPI形式）
    else if (
      response.data &&
      typeof response.data === 'object' &&
      'access_token' in response.data
    ) {
      const data = response.data as Record<string, unknown>;
      token = data.access_token as string;
    }

    if (!token) {
      throw new DifyAPIError('No token in response', 500, JSON.stringify(response));
    }

    this.#token = token;
    return this.#token;
  }

  /**
   * トークンを取得する
   * @returns {Promise<string>} トークン
   * @throws {DifyAPIError} APIエラー
   * @private
   */
  async #getToken(): Promise<string> {
    if (!this.#token) {
      await this.#login();
    }
    // この時点で#tokenは必ず存在する（#loginがエラーを投げるか、値を設定するため）
    return this.#token as string;
  }

  /**
   * アプリケーション一覧を取得する
   * @returns {Promise<{ data: readonly DifyApp[] }>} アプリケーション一覧
   * @throws {DifyAPIError} APIエラー
   */
  async getApps(): Promise<{ data: readonly DifyApp[] }> {
    const token = await this.#getToken();
    const response = this.#fetch('/console/api/apps', {
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
    });

    // レスポンスの詳細をログに出力（デバッグ用）
    Logger.log(`Get apps response: ${JSON.stringify(response)}`);

    if (!response.data || !Array.isArray(response.data)) {
      throw new DifyAPIError('Invalid apps data in response', 500, JSON.stringify(response));
    }

    return { data: response.data as readonly DifyApp[] };
  }

  /**
   * APIキーを使ってワークフローを実行する
   * @param {string} appId アプリケーションID
   * @param {string} apiKey アプリケーションAPIキー
   * @param {Record<string, unknown>} inputs 入力データ
   * @param {string} [responseMode="blocking"] レスポンスモード ("blocking"または"streaming")
   * @param {string} [userIdentifier="system-cron"] ユーザー識別子（オプション、デフォルトは"system-cron"）
   * @returns {Promise<DifyResponse>} 実行結果
   * @throws {DifyAPIError} APIエラー
   */
  async executeWorkflowWithApiKey(
    appId: string,
    apiKey: string,
    inputs: Record<string, unknown>,
    responseMode: 'blocking' | 'streaming' = 'blocking',
    userIdentifier = 'system-cron',
  ): Promise<DifyResponse> {
    try {
      if (!apiKey) {
        throw new DifyAPIError('API key is required', 400, 'No API key provided');
      }

      Logger.log(`Executing workflow with API key for app ${appId}`);

      const payload: Record<string, unknown> = {
        inputs: inputs,
        response_mode: responseMode,
        user: userIdentifier,
      };

      Logger.log(`Payload: ${JSON.stringify(payload)}`);

      // 正しいエンドポイントのみを使用
      return this.#fetch('/v1/workflows/run', {
        method: 'post',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
    } catch (error) {
      Logger.log(`Error executing workflow with API key: ${error}`);
      if (error instanceof DifyAPIError) {
        throw error;
      }
      throw new DifyAPIError(
        `Failed to execute workflow with API key: ${String(error)}`,
        500,
        String(error),
      );
    }
  }
}
