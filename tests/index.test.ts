import {
  syncDifyApps,
  checkAndRunCronJobs,
  createSyncTrigger,
  createCronTrigger,
  isCronMatch,
} from '../src';
import { DifyClient } from '../src/difyClient';
import { SheetManager } from '../src/sheetManager';

// モックの設定
const mockGetProperty = jest.fn();
const mockLog = jest.fn();
const mockCreateTrigger = jest.fn();
const mockEveryHours = jest.fn();
const mockEveryMinutes = jest.fn();
const mockCreate = jest.fn();
const mockGetProjectTriggers = jest.fn();
const mockGetHandlerFunction = jest.fn();
const mockDeleteTrigger = jest.fn();

interface MockPropertiesService {
  getScriptProperties(): {
    getProperty(key: string): string | null;
  };
}

interface MockScriptApp {
  newTrigger(functionName: string): {
    timeBased(): {
      everyHours(hours: number): { create(): void };
      everyMinutes(minutes: number): { create(): void };
    };
  };
  getProjectTriggers(): Array<{
    getHandlerFunction(): string;
  }>;
  deleteTrigger(trigger: unknown): void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      PropertiesService: MockPropertiesService;
      Logger: {
        log: jest.Mock;
      };
      ScriptApp: MockScriptApp;
    }
  }
}

// unknown経由でキャストすることで型エラーを回避
(global as unknown as { PropertiesService: MockPropertiesService }).PropertiesService = {
  getScriptProperties: () => ({
    getProperty: mockGetProperty,
  }),
};

(global as unknown as { Logger: { log: jest.Mock } }).Logger = {
  log: mockLog,
};

(global as unknown as { ScriptApp: MockScriptApp }).ScriptApp = {
  newTrigger: (functionName: string) => {
    mockCreateTrigger(functionName);
    return {
      timeBased: () => ({
        everyHours: (hours: number) => {
          mockEveryHours(hours);
          return { create: mockCreate };
        },
        everyMinutes: (minutes: number) => {
          mockEveryMinutes(minutes);
          return { create: mockCreate };
        },
      }),
    };
  },
  getProjectTriggers: () => {
    const triggers = mockGetProjectTriggers();
    return triggers.map((fn: string) => ({ getHandlerFunction: () => fn }));
  },
  deleteTrigger: mockDeleteTrigger,
};

// DifyClientとSheetManagerのモック
jest.mock('../src/difyClient');
jest.mock('../src/sheetManager');

// isCronMatchをモック化
jest.mock('../src', () => {
  const originalModule = jest.requireActual('../src');
  return {
    ...originalModule,
    isCronMatch: jest.fn().mockImplementation((date, row) => {
      // このデフォルト実装は後でテスト内で上書きされます
      return false;
    }),
  };
});

describe('Main Application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProperty.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        DIFY_BASE_URL: 'https://api.dify.test',
        DIFY_USERNAME: 'test-user',
        DIFY_PASSWORD: 'test-pass',
      };
      return config[key] || null;
    });
    mockGetProjectTriggers.mockReturnValue([]);
  });

  describe('syncDifyApps', () => {
    it('should sync Dify apps with spreadsheet', async () => {
      const mockApps = [
        { id: 'app1', name: 'App 1', description: 'Test App 1' },
        { id: 'app2', name: 'App 2', description: 'Test App 2' },
      ];

      const mockGetApps = jest.fn().mockResolvedValue({ data: mockApps });
      const mockSyncApps = jest.fn();

      (DifyClient as jest.Mock).mockImplementation(() => ({
        getApps: mockGetApps,
      }));

      (SheetManager as jest.Mock).mockImplementation(() => ({
        syncApps: mockSyncApps,
      }));

      await syncDifyApps();

      expect(DifyClient).toHaveBeenCalledWith({
        baseUrl: 'https://api.dify.test',
        username: 'test-user',
        password: 'test-pass',
      });
      expect(mockGetApps).toHaveBeenCalled();
      expect(mockSyncApps).toHaveBeenCalledWith(mockApps);
      expect(mockLog).toHaveBeenCalledWith('Dify apps synced successfully.');
    });

    it('should handle missing configuration', async () => {
      mockGetProperty.mockReturnValue(null);
      await expect(syncDifyApps()).rejects.toThrow('Missing required configuration');
    });

    it('should handle API errors', async () => {
      const mockGetApps = jest.fn().mockRejectedValue(new Error('API Error'));
      (DifyClient as jest.Mock).mockImplementation(() => ({
        getApps: mockGetApps,
      }));

      await expect(syncDifyApps()).rejects.toThrow('API Error');
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Failed to sync Dify apps'));
    });
  });

  describe('Trigger Creation', () => {
    it('should create sync trigger', () => {
      createSyncTrigger();
      expect(mockCreateTrigger).toHaveBeenCalledWith('syncDifyApps');
      expect(mockEveryHours).toHaveBeenCalledWith(1);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should create cron trigger', () => {
      createCronTrigger();
      expect(mockCreateTrigger).toHaveBeenCalledWith('checkAndRunCronJobs');
      expect(mockEveryMinutes).toHaveBeenCalledWith(1);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should delete existing triggers before creating new ones', () => {
      mockGetProjectTriggers.mockReturnValue(['syncDifyApps', 'otherFunction']);
      createSyncTrigger();
      expect(mockDeleteTrigger).toHaveBeenCalledTimes(1);
    });
  });
});
