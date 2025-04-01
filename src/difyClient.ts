import type {
  DifyAuthResponse,
  DifyAppsResponse,
  DifyConfig,
  HTTPResponse,
  DifyApp,
} from './types';

declare const UrlFetchApp: GoogleAppsScript.URL_Fetch.UrlFetchApp;

interface DifyResponse {
  token?: string;
  data?: readonly DifyApp[];
  [key: string]: unknown;
}

/**
 * Dify APIのエラー
 */
export class APIError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = 'APIError';
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
   * @throws {APIError} APIエラー
   * @private
   */
  #fetch(path: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): DifyResponse {
    const url = `${this.#config.baseUrl}${path}`;
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new APIError(`API request failed: ${url}`, statusCode, response.getContentText());
    }
    return JSON.parse(response.getContentText());
  }

  /**
   * ログインする
   * @returns {Promise<string>} トークン
   * @throws {APIError} APIエラー
   * @private
   */
  async #login(): Promise<string> {
    const response = await this.#fetch('/auth/login', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        username: this.#config.username,
        password: this.#config.password,
      }),
      muteHttpExceptions: true,
    });

    if (!response.token) {
      throw new APIError('No token in response', 500, JSON.stringify(response));
    }

    this.#token = response.token;
    return this.#token;
  }

  /**
   * トークンを取得する
   * @returns {Promise<string>} トークン
   * @throws {APIError} APIエラー
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
   * @throws {APIError} APIエラー
   */
  async getApps(): Promise<{ data: readonly DifyApp[] }> {
    const token = await this.#getToken();
    const response = await this.#fetch('/apps', {
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
    });

    if (!response.data) {
      throw new APIError('No data in response', 500, JSON.stringify(response));
    }

    return { data: response.data };
  }

  /**
   * ワークフローを実行する
   * @param {string} appId アプリケーションID
   * @param {Record<string, unknown>} args 引数
   * @returns {Promise<DifyResponse>} 実行結果
   * @throws {APIError} APIエラー
   */
  async executeWorkflow(appId: string, args: Record<string, unknown>): Promise<DifyResponse> {
    const token = await this.#getToken();
    return await this.#fetch(`/apps/${appId}/workflow`, {
      method: 'post',
      headers: { Authorization: `Bearer ${token}` },
      contentType: 'application/json',
      payload: JSON.stringify({ ...args }),
      muteHttpExceptions: true,
    });
  }

  /**
   * テスト用のメソッドを取得する
   * @returns {Object} テスト用のメソッド
   */
  getTestMethods() {
    return {
      login: async (): Promise<string> => this.#login(),
      getToken: async (): Promise<string> => this.#getToken(),
    };
  }
}
