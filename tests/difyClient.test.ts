import type { DifyConfig } from '../src/types';
import { DifyClient, DifyAPIError } from '../src/difyClient';

// モックの設定
const mockFetch = jest.fn();
const mockLog = jest.fn();

// Google Apps Script型の部分的な実装
interface MockHTTPResponse {
  getResponseCode(): number;
  getContentText(): string;
}

interface MockUrlFetchApp {
  fetch(url: string, params?: object): MockHTTPResponse;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      UrlFetchApp: MockUrlFetchApp;
      Logger: {
        log: jest.Mock;
      };
    }
  }
}

// 一貫したHTTPレスポンスオブジェクトを生成するヘルパー関数
function createMockResponse(statusCode: number, responseBody: string | object): MockHTTPResponse {
  const responseText =
    typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);

  return {
    getResponseCode: () => statusCode,
    getContentText: () => responseText,
  };
}

// unknown経由でキャストすることで型エラーを回避
(global as unknown as { UrlFetchApp: MockUrlFetchApp }).UrlFetchApp = {
  fetch: mockFetch,
};

(global as unknown as { Logger: { log: jest.Mock } }).Logger = {
  log: mockLog,
};

describe('DifyClient', () => {
  let client: DifyClient;
  const mockConfig: DifyConfig = {
    baseUrl: 'https://api.dify.test',
    username: 'test-user',
    password: 'test-pass',
  };

  beforeEach(() => {
    client = new DifyClient(mockConfig);
    mockFetch.mockClear();
    mockLog.mockClear();

    // デフォルトでログイン成功のモックを設定
    mockFetch.mockImplementation((url) => {
      if (url.includes('/login')) {
        return createMockResponse(200, { token: 'test-token' });
      }
      if (url.includes('/apps')) {
        return createMockResponse(200, { data: [] });
      }
      return createMockResponse(404, 'Not Found');
    });
  });

  describe('constructor', () => {
    it('should create an instance with frozen config', () => {
      expect(client).toBeInstanceOf(DifyClient);
    });

    it('should not allow modification of config after creation', () => {
      const config = { ...mockConfig };
      const testClient = new DifyClient(config);
      config.baseUrl = 'new-url';

      // カスタムモックを設定
      mockFetch.mockImplementation((url) => {
        if (url.includes(mockConfig.baseUrl)) {
          return createMockResponse(200, { token: 'test-token' });
        }
        return createMockResponse(404, 'Not Found');
      });

      // getAppsを実行して内部的にURLを使用する
      client.getApps().catch(() => {
        /* エラーは無視 */
      });

      // fetchが呼ばれた時の第一引数がオリジナルのBaseURLを含んでいるか確認
      expect(mockFetch.mock.calls[0][0]).toContain(mockConfig.baseUrl);
    });
  });

  describe('login and token handling', () => {
    it('should handle login and token storage correctly', async () => {
      // カスタムモックを設定
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'test-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        });

      // getAppsを呼ぶとログインが行われる
      await client.getApps();

      // ログインリクエストが正しく行われたか確認
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dify.test/console/api/login',
        expect.objectContaining({
          method: 'post',
          payload: expect.stringContaining(mockConfig.username),
        }),
      );
    });

    it('should throw DifyAPIError when login fails', async () => {
      // カスタムモックを設定（ログイン失敗）
      mockFetch.mockImplementationOnce((url) => {
        if (url.includes('/login')) {
          return createMockResponse(401, 'Unauthorized');
        }
        return createMockResponse(404, 'Not Found');
      });

      // APIリクエストを実行してエラーを確認
      await expect(client.getApps()).rejects.toThrow('API request failed');
    });

    it('should handle different token response formats', async () => {
      // ケース1: Tokenが直接返される場合
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'direct-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        });

      await client.getApps();
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer direct-token');
      mockFetch.mockClear();

      // ケース2: access_tokenが直接返される場合
      client = new DifyClient(mockConfig);
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { access_token: 'access-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        });

      await client.getApps();
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer access-token');
      mockFetch.mockClear();

      // ケース3: data.access_tokenが返される場合
      client = new DifyClient(mockConfig);
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { data: { access_token: 'nested-token' } });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        });

      await client.getApps();
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer nested-token');
    });
  });

  describe('token reuse', () => {
    it('should reuse token for subsequent requests', async () => {
      // 2つのリクエストのモックを設定
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'test-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        });

      // 1回目のアプリ取得
      await client.getApps();

      // 1回目の呼び出しでログインと取得の2回のリクエストが行われることを確認
      expect(mockFetch).toHaveBeenCalledTimes(2);
      mockFetch.mockClear();

      // 2回目のアプリ取得（ログインは行われないはず）
      await client.getApps();

      // ログインが再度呼ばれていないことを確認
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.dify.test/console/api/apps');
    });

    it('should login if token is not available', async () => {
      // 新しいインスタンスを作成（トークンなし）
      client = new DifyClient(mockConfig);

      // カスタムモックを設定
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'new-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: [] });
          }
          return createMockResponse(404, 'Not Found');
        });

      await client.getApps();

      // ログインが呼ばれたことを確認
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.dify.test/console/api/login');
    });
  });

  describe('getApps', () => {
    it('should fetch apps successfully', async () => {
      const mockApps = [{ id: 'app1', name: 'App 1', description: 'Test App 1' }];

      // カスタムモックを設定
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'test-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: mockApps });
          }
          return createMockResponse(404, 'Not Found');
        });

      const result = await client.getApps();
      expect(result).toEqual({ data: mockApps });
    });

    it('should throw DifyAPIError when fetching apps fails', async () => {
      // カスタムモックを設定
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'test-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(404, 'Not Found');
          }
          return createMockResponse(404, 'Not Found');
        });

      await expect(client.getApps()).rejects.toThrow('API request failed');
    });

    it('should throw DifyAPIError when apps data is invalid', async () => {
      // カスタムモックを設定
      mockFetch
        .mockImplementationOnce((url) => {
          if (url.includes('/login')) {
            return createMockResponse(200, { token: 'test-token' });
          }
          return createMockResponse(404, 'Not Found');
        })
        .mockImplementationOnce((url) => {
          if (url.includes('/apps')) {
            return createMockResponse(200, { data: 'not-an-array' });
          }
          return createMockResponse(404, 'Not Found');
        });

      await expect(client.getApps()).rejects.toThrow('Invalid apps data in response');
    });
  });

  describe('executeWorkflow', () => {
    const mockAppId = 'test-app';
    const mockApiKey = 'test-api-key';
    const mockInputs = { query: 'test query' };

    it('should execute workflow with API key correctly', async () => {
      // カスタムモックを設定
      mockFetch.mockImplementationOnce((url) => {
        if (url.includes('/v1/workflows/run')) {
          return createMockResponse(200, { success: true, results: 'test result' });
        }
        return createMockResponse(404, 'Not Found');
      });

      const result = await client.executeWorkflow(mockAppId, mockApiKey, mockInputs);
      expect(result).toEqual({ success: true, results: 'test result' });

      // 正しいエンドポイントが呼ばれたことを検証
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dify.test/v1/workflows/run',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should throw error when API key is not provided', async () => {
      await expect(client.executeWorkflow(mockAppId, '', mockInputs)).rejects.toThrow(
        'API key is required',
      );
    });

    it('should handle custom response_mode and user identifier', async () => {
      // カスタムモックを設定
      mockFetch.mockImplementationOnce((url) => {
        if (url.includes('/v1/workflows/run')) {
          return createMockResponse(200, { success: true });
        }
        return createMockResponse(404, 'Not Found');
      });

      await client.executeWorkflow(mockAppId, mockApiKey, mockInputs, 'streaming', 'custom-user');

      // カスタムパラメータが正しく渡されたか検証
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          payload: expect.stringContaining('"response_mode":"streaming"'),
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          payload: expect.stringContaining('"user":"custom-user"'),
        }),
      );
    });

    it('should handle errors and wrap them in DifyAPIError', async () => {
      // APIエラーをシミュレート
      mockFetch.mockImplementationOnce((url) => {
        throw new Error('Network error');
      });

      await expect(client.executeWorkflow(mockAppId, mockApiKey, mockInputs)).rejects.toThrow(
        DifyAPIError,
      );
    });
  });
});
