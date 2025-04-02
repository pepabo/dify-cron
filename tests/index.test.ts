import {
  syncDifyApps,
  checkAndRunCronJobs,
  createSyncTrigger,
  createCronTrigger,
  isCronMatch,
} from '../src';
import { DifyClient } from '../src/difyClient';
import { SheetManager } from '../src/sheetManager';
import type { AppRow } from '../src/types';

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

// isCronMatchの元の実装を使用するように戻す
jest.unmock('../src');

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

  describe('isCronMatch', () => {
    let testDate: Date;
    let cronConfig: AppRow;

    beforeEach(() => {
      // 2023年1月23日 (月) 14:35:00
      testDate = new Date(2023, 0, 23, 14, 35, 0);

      // デフォルトのcron設定
      cronConfig = {
        enabled: true,
        id: 'test-id',
        name: 'Test App',
        description: 'Test Description',
        apiSecret: '',
        cronMinutes: '*',
        cronHours: '*',
        cronDayOfMonth: '*',
        cronMonth: '*',
        cronDayOfWeek: '*',
        args: '',
        lastSync: '',
        lastRun: '',
      };
    });

    it('should match when all fields are wildcard (*)', () => {
      expect(isCronMatch(testDate, cronConfig)).toBe(true);
    });

    it('should match when minute matches exactly', () => {
      cronConfig.cronMinutes = '35';
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronMinutes = '36';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when hour matches exactly', () => {
      cronConfig.cronHours = '14';
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronHours = '15';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when day of month matches exactly', () => {
      cronConfig.cronDayOfMonth = '23';
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronDayOfMonth = '24';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when month matches exactly', () => {
      cronConfig.cronMonth = '1'; // 1月
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronMonth = '2';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when day of week matches exactly', () => {
      cronConfig.cronDayOfWeek = '1'; // 月曜日
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronDayOfWeek = '2';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when using range expressions', () => {
      cronConfig.cronMinutes = '30-40';
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronMinutes = '10-30';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when using list expressions', () => {
      cronConfig.cronMinutes = '10,35,55';
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronMinutes = '10,20,30';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when using step expressions', () => {
      cronConfig.cronMinutes = '*/5'; // 5分ごと（0, 5, 10, 15, ..., 55）
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      cronConfig.cronMinutes = '*/10'; // 10分ごと（0, 10, 20, 30, 40, 50）
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });

    it('should match when using complex expressions', () => {
      // 複合式：月曜日の午後2時から4時の間の5分ごと
      cronConfig.cronMinutes = '*/5';
      cronConfig.cronHours = '14-16';
      cronConfig.cronDayOfWeek = '1';
      expect(isCronMatch(testDate, cronConfig)).toBe(true);

      // 複合式：月曜日の午後2時から4時の間の10分ごと
      cronConfig.cronMinutes = '*/10';
      expect(isCronMatch(testDate, cronConfig)).toBe(false);
    });
  });

  describe('checkAndRunCronJobs', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should execute workflows for apps that match the cron schedule', async () => {
      // モックデータ
      const mockRows = [
        {
          enabled: true,
          id: 'app1',
          name: 'App 1',
          description: 'App 1 Description',
          apiSecret: '',
          cronMinutes: '*',
          cronHours: '*',
          cronDayOfMonth: '*',
          cronMonth: '*',
          cronDayOfWeek: '*',
          args: '{"param":"value"}',
          lastSync: '',
          lastRun: '',
        },
        {
          enabled: true,
          id: 'app2',
          name: 'App 2',
          description: 'App 2 Description',
          apiSecret: 'api-secret-2',
          cronMinutes: '0', // 実行しないはず（cron不一致）
          cronHours: '*',
          cronDayOfMonth: '*',
          cronMonth: '*',
          cronDayOfWeek: '*',
          args: '{}',
          lastSync: '',
          lastRun: '',
        },
        {
          enabled: false, // 無効化されているのでスキップされるはず
          id: 'app3',
          name: 'App 3',
          description: 'App 3 Description',
          apiSecret: '',
          cronMinutes: '*',
          cronHours: '*',
          cronDayOfMonth: '*',
          cronMonth: '*',
          cronDayOfWeek: '*',
          args: '',
          lastSync: '',
          lastRun: '',
        },
      ];

      // モックの設定
      const mockGetAllRows = jest.fn().mockReturnValue(mockRows);
      const mockUpdateLastRun = jest.fn();
      const mockExecuteWorkflow = jest.fn().mockResolvedValue({ success: true });
      const mockExecuteWorkflowWithApiKey = jest.fn().mockResolvedValue({ success: true });

      (SheetManager as jest.Mock).mockImplementation(() => ({
        getAllRows: mockGetAllRows,
        updateLastRun: mockUpdateLastRun,
      }));

      (DifyClient as jest.Mock).mockImplementation(() => ({
        executeWorkflow: mockExecuteWorkflow,
        executeWorkflowWithApiKey: mockExecuteWorkflowWithApiKey,
      }));

      // テスト実行
      await checkAndRunCronJobs();

      // 検証
      expect(mockGetAllRows).toHaveBeenCalled();
      expect(mockExecuteWorkflow).toHaveBeenCalledWith('app1', { param: 'value' });
      expect(mockExecuteWorkflowWithApiKey).not.toHaveBeenCalled(); // app2はcron不一致なので実行されない
      expect(mockUpdateLastRun).toHaveBeenCalledWith('app1', expect.any(String));
      expect(mockUpdateLastRun).not.toHaveBeenCalledWith('app2', expect.any(String));
      expect(mockUpdateLastRun).not.toHaveBeenCalledWith('app3', expect.any(String));
    });

    it('should use API key when available', async () => {
      // API Keyを持つアプリのモックデータ
      const mockRows = [
        {
          enabled: true,
          id: 'app-with-key',
          name: 'App With Key',
          description: 'App with API Key',
          apiSecret: 'test-api-key',
          cronMinutes: '*',
          cronHours: '*',
          cronDayOfMonth: '*',
          cronMonth: '*',
          cronDayOfWeek: '*',
          args: '{"test":true}',
          lastSync: '',
          lastRun: '',
        },
      ];

      // モックの設定
      const mockGetAllRows = jest.fn().mockReturnValue(mockRows);
      const mockUpdateLastRun = jest.fn();
      const mockExecuteWorkflow = jest.fn();
      const mockExecuteWorkflowWithApiKey = jest.fn().mockResolvedValue({ success: true });

      (SheetManager as jest.Mock).mockImplementation(() => ({
        getAllRows: mockGetAllRows,
        updateLastRun: mockUpdateLastRun,
      }));

      (DifyClient as jest.Mock).mockImplementation(() => ({
        executeWorkflow: mockExecuteWorkflow,
        executeWorkflowWithApiKey: mockExecuteWorkflowWithApiKey,
      }));

      // テスト実行
      await checkAndRunCronJobs();

      // 検証
      expect(mockExecuteWorkflowWithApiKey).toHaveBeenCalledWith(
        'app-with-key',
        'test-api-key',
        { test: true },
        'blocking',
        'cron-job-app-with-key',
      );
      expect(mockExecuteWorkflow).not.toHaveBeenCalled();
      expect(mockUpdateLastRun).toHaveBeenCalledWith('app-with-key', expect.any(String));
    });

    it('should handle errors during execution', async () => {
      // エラーが発生するアプリのモックデータ
      const mockRows = [
        {
          enabled: true,
          id: 'app-with-error',
          name: 'Error App',
          description: 'This app will throw an error',
          apiSecret: '',
          cronMinutes: '*',
          cronHours: '*',
          cronDayOfMonth: '*',
          cronMonth: '*',
          cronDayOfWeek: '*',
          args: '{}',
          lastSync: '',
          lastRun: '',
        },
      ];

      // モックの設定
      const mockGetAllRows = jest.fn().mockReturnValue(mockRows);
      const mockUpdateLastRun = jest.fn();
      const mockExecuteWorkflow = jest.fn().mockRejectedValue(new Error('Test error'));

      (SheetManager as jest.Mock).mockImplementation(() => ({
        getAllRows: mockGetAllRows,
        updateLastRun: mockUpdateLastRun,
      }));

      (DifyClient as jest.Mock).mockImplementation(() => ({
        executeWorkflow: mockExecuteWorkflow,
      }));

      // テスト実行 - エラーがスローされずにキャッチされることを確認
      await expect(checkAndRunCronJobs()).resolves.not.toThrow();

      // エラーログが出力されることを確認
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Failed to execute workflow'));
      // 更新が実行されないことを確認
      expect(mockUpdateLastRun).not.toHaveBeenCalled();
    });

    it('should handle global errors', async () => {
      // 全体的なエラーをシミュレート
      (SheetManager as jest.Mock).mockImplementation(() => {
        throw new Error('Test global error');
      });

      // テスト実行 - エラーがスローされることを確認
      await expect(checkAndRunCronJobs()).rejects.toThrow('Test global error');
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check and run cron jobs'),
      );
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
