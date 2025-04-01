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
   * ワークフローを実行する
   * @param {string} appId アプリケーションID
   * @param {Record<string, unknown>} args 引数
   * @returns {Promise<DifyResponse>} 実行結果
   * @throws {DifyAPIError} APIエラー
   */
  async executeWorkflow(appId: string, args: Record<string, unknown>): Promise<DifyResponse> {
    const token = await this.#getToken();
    return this.#fetch(`/console/api/apps/${appId}/workflow`, {
      method: 'post',
      headers: { Authorization: `Bearer ${token}` },
      contentType: 'application/json',
      payload: JSON.stringify({ ...args }),
      muteHttpExceptions: true,
    });
  }

  /**
   * アプリのDSLファイルをエクスポートする
   * @param {string} appId アプリケーションID
   * @param {boolean} includeSecret シークレット変数を含めるかどうか
   * @returns {Promise<DifyResponse>} DSLデータ
   * @throws {DifyAPIError} APIエラー
   */
  async exportAppDSL(appId: string, includeSecret = true): Promise<DifyResponse> {
    const token = await this.#getToken();
    return this.#fetch(`/console/api/apps/${appId}/export?include_secret=${includeSecret}`, {
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
    });
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
      Logger.log(`Executing workflow with API key for app ${appId}`);

      // 正しいエンドポイントとリクエスト形式に修正
      // ホストごとに異なる可能性があるため、複数のパスパターンを試す

      // まずオリジナルのパスで試す
      const payload: Record<string, unknown> = {
        inputs: inputs,
        response_mode: responseMode,
        // userパラメータは必須なので必ず含める
        user: userIdentifier,
      };

      Logger.log(`Payload: ${JSON.stringify(payload)}`);

      try {
        // 1. 最初にパターン1で試す: /v1/workflows/run
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
      } catch (error1) {
        Logger.log(`First endpoint attempt failed: ${error1}`);

        try {
          // 2. パターン2で試す: /api/workflow-run
          Logger.log('Trying alternative endpoint: /api/workflow-run');
          return this.#fetch('/api/workflow-run', {
            method: 'post',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
          });
        } catch (error2) {
          Logger.log(`Second endpoint attempt failed: ${error2}`);

          // 3. パターン3で試す: /workflows/${appId}/run
          Logger.log(`Trying third endpoint: /workflows/${appId}/run`);
          return this.#fetch(`/workflows/${appId}/run`, {
            method: 'post',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
          });
        }
      }
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

  /**
   * ファイル変数をアップロードしてワークフローに送信するための準備を行う
   * @param {string} variableName 変数名
   * @param {string} uploadFileId アップロードされたファイルID
   * @param {string} [documentType="text"] ドキュメントタイプ
   * @param {string} [transferMethod="local_file"] 転送方式
   * @returns {Object} ファイル変数オブジェクト
   */
  createFileVariable(
    variableName: string,
    uploadFileId: string,
    documentType = 'text',
    transferMethod = 'local_file',
  ): Record<string, unknown[]> {
    return {
      [variableName]: [
        {
          transfer_method: transferMethod,
          upload_file_id: uploadFileId,
          type: documentType,
        },
      ],
    };
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
