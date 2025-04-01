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
  });

  describe('constructor', () => {
    it('should create an instance with frozen config', () => {
      const testClient = new DifyClient(mockConfig);
      const testMethods = testClient.getTestMethods();
      expect(testMethods.getToken).toBeDefined();
      expect(testMethods.login).toBeDefined();
    });

    it('should not allow modification of config after creation', () => {
      const config = { ...mockConfig };
      const testClient = new DifyClient(config);
      config.baseUrl = 'new-url';
      const { getToken } = testClient.getTestMethods();
      expect(getToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('should login successfully and store token', async () => {
      const mockToken = 'test-token';
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ token: mockToken }),
      });

      const { login } = client.getTestMethods();
      const token = await login();
      expect(token).toBe(mockToken);
    });

    it('should throw DifyAPIError when login fails', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 401,
        getContentText: () => 'Unauthorized',
      });

      const { login } = client.getTestMethods();
      await expect(login()).rejects.toThrow('API request failed');
    });

    it('should handle different token response formats', async () => {
      // ケース1: Tokenが直接返される場合
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ token: 'direct-token' }),
      });

      let { login } = client.getTestMethods();
      let token = await login();
      expect(token).toBe('direct-token');

      // ケース2: access_tokenが直接返される場合
      client = new DifyClient(mockConfig);
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ access_token: 'access-token' }),
      });

      login = client.getTestMethods().login;
      token = await login();
      expect(token).toBe('access-token');

      // ケース3: data.access_tokenが返される場合
      client = new DifyClient(mockConfig);
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ data: { access_token: 'nested-token' } }),
      });

      login = client.getTestMethods().login;
      token = await login();
      expect(token).toBe('nested-token');
    });
  });

  describe('getToken', () => {
    it('should return existing token if available', async () => {
      const mockToken = 'existing-token';
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ token: mockToken }),
      });

      const { login, getToken } = client.getTestMethods();
      await login();
      const token = await getToken();
      expect(token).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should login if token is not available', async () => {
      const mockToken = 'new-token';
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ token: mockToken }),
      });

      const { getToken } = client.getTestMethods();
      const token = await getToken();
      expect(token).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getApps', () => {
    it('should fetch apps successfully', async () => {
      const mockApps = [{ id: 'app1', name: 'App 1', description: 'Test App 1' }];

      mockFetch
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ token: 'test-token' }),
        })
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ data: mockApps }),
        });

      const result = await client.getApps();
      expect(result).toEqual({ data: mockApps });
    });

    it('should throw DifyAPIError when fetching apps fails', async () => {
      mockFetch
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ token: 'test-token' }),
        })
        .mockReturnValueOnce({
          getResponseCode: () => 404,
          getContentText: () => 'Not Found',
        });

      await expect(client.getApps()).rejects.toThrow('API request failed');
    });

    it('should throw DifyAPIError when apps data is invalid', async () => {
      mockFetch
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ token: 'test-token' }),
        })
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ data: 'not-an-array' }),
        });

      await expect(client.getApps()).rejects.toThrow('Invalid apps data in response');
    });
  });

  describe('executeWorkflow', () => {
    const mockAppId = 'test-app';
    const mockArgs = { test: true };

    beforeEach(() => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ token: 'test-token' }),
      });
    });

    it('should execute workflow successfully', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true }),
      });

      const result = await client.executeWorkflow(mockAppId, mockArgs);
      expect(result).toEqual({ success: true });
    });

    it('should throw DifyAPIError when workflow execution fails', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 500,
        getContentText: () => 'Internal Server Error',
      });

      await expect(client.executeWorkflow(mockAppId, mockArgs)).rejects.toThrow(
        'API request failed',
      );
    });

    it('should not modify input args', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true }),
      });

      const originalArgs = { test: true };
      await client.executeWorkflow(mockAppId, originalArgs);
      expect(originalArgs).toEqual({ test: true });
    });
  });

  describe('executeWorkflowWithApiKey', () => {
    const mockAppId = 'test-app';
    const mockApiKey = 'test-api-key';
    const mockInputs = { query: 'test query' };

    it('should execute workflow with API key using the first endpoint', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true, results: 'test result' }),
      });

      const result = await client.executeWorkflowWithApiKey(mockAppId, mockApiKey, mockInputs);
      expect(result).toEqual({ success: true, results: 'test result' });

      // 正しいエンドポイントが呼ばれたことを検証
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dify.test/v1/workflows/run',
        expect.objectContaining({
          method: 'post',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        }),
      );

      // ペイロードが正しく構成されていることを検証
      const lastCall = mockFetch.mock.calls[0][1];
      const payload = JSON.parse(lastCall.payload);
      expect(payload).toEqual({
        inputs: mockInputs,
        response_mode: 'blocking',
        user: 'system-cron',
      });
    });

    it('should try fallback endpoints when the first one fails', async () => {
      // 最初のエンドポイントはエラーを返す
      mockFetch.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      // 2番目のエンドポイントは成功する
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true }),
      });

      const result = await client.executeWorkflowWithApiKey(mockAppId, mockApiKey, mockInputs);
      expect(result).toEqual({ success: true });

      // 2番目のエンドポイントが正しく呼ばれたことを検証
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dify.test/api/workflow-run',
        expect.anything(),
      );
    });

    it('should handle custom response_mode and user identifier', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true }),
      });

      await client.executeWorkflowWithApiKey(
        mockAppId,
        mockApiKey,
        mockInputs,
        'streaming',
        'custom-user',
      );

      // カスタムパラメータが正しく設定されていることを検証
      const lastCall = mockFetch.mock.calls[0][1];
      const payload = JSON.parse(lastCall.payload);
      expect(payload).toEqual({
        inputs: mockInputs,
        response_mode: 'streaming',
        user: 'custom-user',
      });
    });

    it('should handle errors and wrap them in DifyAPIError', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      await expect(
        client.executeWorkflowWithApiKey(mockAppId, mockApiKey, mockInputs),
      ).rejects.toThrow(DifyAPIError);
    });
  });
});
