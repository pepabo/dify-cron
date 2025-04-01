import { fetchAndCreateSpreadsheet, executeScheduledWorkflows } from '../src';
import { DifyClient } from '../src/difyClient';
import { SheetManager } from '../src/sheetManager';

// モックの設定
const mockGetProperty = jest.fn();
const mockLog = jest.fn();

interface MockPropertiesService {
  getScriptProperties(): {
    getProperty(key: string): string | null;
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      PropertiesService: MockPropertiesService;
      Logger: {
        log: jest.Mock;
      };
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

// DifyClientとSheetManagerのモック
jest.mock('../src/difyClient');
jest.mock('../src/sheetManager');

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
  });

  describe('fetchAndCreateSpreadsheet', () => {
    it('should fetch apps and create spreadsheet successfully', async () => {
      const mockApps = [{ id: 'app1', name: 'App 1', description: 'Test App 1' }];

      const mockGetApps = jest.fn().mockResolvedValue({ data: mockApps });
      const mockWriteApps = jest.fn();
      const mockGetUrl = jest.fn().mockReturnValue('https://example.com/sheet');

      (DifyClient as jest.Mock).mockImplementation(() => ({
        getApps: mockGetApps,
      }));

      (SheetManager as jest.Mock).mockImplementation(() => ({
        writeApps: mockWriteApps,
        getUrl: mockGetUrl,
      }));

      await fetchAndCreateSpreadsheet();

      expect(DifyClient).toHaveBeenCalledWith({
        baseUrl: 'https://api.dify.test',
        username: 'test-user',
        password: 'test-pass',
      });
      expect(mockGetApps).toHaveBeenCalled();
      expect(mockWriteApps).toHaveBeenCalledWith(mockApps);
      expect(mockLog).toHaveBeenCalledWith('Spreadsheet created: https://example.com/sheet');
    });

    it('should handle missing configuration', async () => {
      mockGetProperty.mockReturnValue(null);
      await expect(fetchAndCreateSpreadsheet()).rejects.toThrow('Missing required configuration');
    });

    it('should handle API errors', async () => {
      const mockGetApps = jest.fn().mockRejectedValue(new Error('API Error'));
      (DifyClient as jest.Mock).mockImplementation(() => ({
        getApps: mockGetApps,
      }));

      await expect(fetchAndCreateSpreadsheet()).rejects.toThrow('API Error');
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch apps'));
    });
  });

  describe('executeScheduledWorkflows', () => {
    const mockDate = new Date('2024-04-01T10:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);
      mockGetProperty.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          DIFY_BASE_URL: 'https://api.dify.test',
          DIFY_USERNAME: 'test-user',
          DIFY_PASSWORD: 'test-pass',
        };
        return config[key] || null;
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should execute scheduled workflows', async () => {
      const mockConfigs = [
        { appId: 'app1', schedule: '10:00', args: { test: true } },
        { appId: 'app2', schedule: '11:00', args: { test: false } },
        { appId: 'app3', schedule: '', args: {} },
      ];

      const mockExecuteWorkflow = jest.fn().mockResolvedValue({ success: true });
      const mockReadWorkflowConfigs = jest.fn().mockReturnValue(mockConfigs);

      (DifyClient as jest.Mock).mockImplementation(() => ({
        executeWorkflow: mockExecuteWorkflow,
      }));

      (SheetManager as jest.Mock).mockImplementation(() => ({
        readWorkflowConfigs: mockReadWorkflowConfigs,
      }));

      await executeScheduledWorkflows();

      expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);
      expect(mockExecuteWorkflow).toHaveBeenCalledWith('app1', { test: true });
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Executing workflow for app1'));
    });

    it('should handle invalid schedule format', async () => {
      const mockConfigs = [{ appId: 'app1', schedule: 'invalid', args: {} }];

      (SheetManager as jest.Mock).mockImplementation(() => ({
        readWorkflowConfigs: jest.fn().mockReturnValue(mockConfigs),
      }));

      await executeScheduledWorkflows();

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Skipping workflow for app1'));
    });

    it('should handle workflow execution errors', async () => {
      const mockConfigs = [{ appId: 'app1', schedule: '10:00', args: {} }];

      const mockExecuteWorkflow = jest.fn().mockRejectedValue(new Error('Workflow Error'));
      const mockReadWorkflowConfigs = jest.fn().mockReturnValue(mockConfigs);

      (DifyClient as jest.Mock).mockImplementation(() => ({
        executeWorkflow: mockExecuteWorkflow,
      }));

      (SheetManager as jest.Mock).mockImplementation(() => ({
        readWorkflowConfigs: mockReadWorkflowConfigs,
      }));

      await executeScheduledWorkflows();

      expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Failed to execute workflow'));
    });
  });
});
