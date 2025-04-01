import type { DifyConfig } from '../src/types';
import { DifyClient } from '../src/difyClient';

// モックの設定
const mockFetch = jest.fn();

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
    }
  }
}

// unknown経由でキャストすることで型エラーを回避
(global as unknown as { UrlFetchApp: MockUrlFetchApp }).UrlFetchApp = {
  fetch: mockFetch,
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

    it('should throw APIError when login fails', async () => {
      mockFetch.mockReturnValueOnce({
        getResponseCode: () => 401,
        getContentText: () => 'Unauthorized',
      });

      const { login } = client.getTestMethods();
      await expect(login()).rejects.toThrow('API request failed');
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

    it('should throw APIError when fetching apps fails', async () => {
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

    it('should throw APIError when workflow execution fails', async () => {
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
});
