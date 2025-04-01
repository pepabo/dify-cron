import type { DifyApp } from '../src/types';
import { SheetManager } from '../src/sheetManager';
import { SheetColumns } from '../src/types';

// モックの設定
const mockRange = {
  setValues: jest.fn(),
  getValues: jest.fn(),
};

const mockSheet = {
  getRange: jest.fn().mockReturnValue(mockRange),
  getDataRange: jest.fn().mockReturnValue(mockRange),
  getParent: jest.fn(),
};

const mockSpreadsheet = {
  getActiveSheet: jest.fn().mockReturnValue(mockSheet),
  getUrl: jest.fn().mockReturnValue('https://example.com/sheet'),
};

// Google Apps Script型の部分的な実装
interface MockSpreadsheetApp {
  create(name: string): typeof mockSpreadsheet;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      SpreadsheetApp: MockSpreadsheetApp;
    }
  }
}

// unknown経由でキャストすることで型エラーを回避
(global as unknown as { SpreadsheetApp: MockSpreadsheetApp }).SpreadsheetApp = {
  create: jest.fn().mockReturnValue(mockSpreadsheet),
};

describe('SheetManager', () => {
  let sheetManager: SheetManager;
  const sheetName = 'Test Sheet';

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    mockSpreadsheet.getActiveSheet.mockReturnValue(mockSheet);
    mockSheet.getParent.mockReturnValue(mockSpreadsheet);
    mockSpreadsheet.getUrl.mockReturnValue('https://example.com/sheet');

    sheetManager = new SheetManager(sheetName);
  });

  describe('constructor', () => {
    it('should initialize headers correctly', () => {
      expect(SpreadsheetApp.create).toHaveBeenCalledWith(sheetName);
      expect(mockSheet.getRange).toHaveBeenCalledWith(1, 1, 1, 5);
      expect(mockRange.setValues).toHaveBeenCalledWith([
        [
          SheetColumns.ID,
          SheetColumns.Name,
          SheetColumns.Description,
          SheetColumns.Schedule,
          SheetColumns.Args,
        ],
      ]);
    });

    it('should throw error when spreadsheet creation fails', () => {
      (SpreadsheetApp.create as jest.Mock).mockReturnValueOnce(null);
      expect(() => new SheetManager(sheetName)).toThrow('Failed to create spreadsheet');
    });
  });

  describe('writeApps', () => {
    it('should write apps data correctly', () => {
      const mockApps = [
        { id: 'app1', name: 'App 1', description: 'Test App 1' },
        { id: 'app2', name: 'App 2', description: 'Test App 2' },
      ];

      sheetManager.writeApps(mockApps);

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 1, 2, 5);
      expect(mockRange.setValues).toHaveBeenCalledWith([
        ['app1', 'App 1', 'Test App 1', '', ''],
        ['app2', 'App 2', 'Test App 2', '', ''],
      ]);
    });

    it('should handle empty apps array', () => {
      mockSheet.getRange.mockClear();
      mockRange.setValues.mockClear();

      sheetManager.writeApps([]);

      expect(mockSheet.getRange).not.toHaveBeenCalled();
      expect(mockRange.setValues).not.toHaveBeenCalled();
    });
  });

  describe('readWorkflowConfigs', () => {
    it('should read workflow configs correctly', () => {
      const mockValues = [
        [SheetColumns.ID, SheetColumns.Name, SheetColumns.Description, 'Schedule', 'Args'],
        ['app1', 'App 1', 'Test App 1', '10:00', '{"param":"value"}'],
        ['app2', 'App 2', 'Test App 2', '', ''],
      ];

      mockRange.getValues.mockReturnValue(mockValues);

      const configs = sheetManager.readWorkflowConfigs();

      expect(configs).toHaveLength(2);
      expect(configs[0]).toEqual({
        appId: 'app1',
        schedule: '10:00',
        args: { param: 'value' },
      });
      expect(configs[1]).toEqual({
        appId: 'app2',
        schedule: '',
        args: {},
      });
      expect(Object.isFrozen(configs)).toBe(true);
      for (const config of configs) {
        expect(Object.isFrozen(config)).toBe(true);
      }
    });

    it('should handle empty sheet', () => {
      mockRange.getValues.mockReturnValue([
        [SheetColumns.ID, SheetColumns.Name, SheetColumns.Description, 'Schedule', 'Args'],
      ]);

      const configs = sheetManager.readWorkflowConfigs();
      expect(configs).toHaveLength(0);
      expect(Object.isFrozen(configs)).toBe(true);
    });

    it('should handle invalid JSON in args', () => {
      const mockValues = [
        [SheetColumns.ID, SheetColumns.Name, SheetColumns.Description, 'Schedule', 'Args'],
        ['app1', 'App 1', 'Test App 1', '10:00', 'invalid-json'],
      ];

      mockRange.getValues.mockReturnValue(mockValues);

      expect(() => sheetManager.readWorkflowConfigs()).toThrow(SyntaxError);
    });
  });

  describe('getUrl', () => {
    it('should return spreadsheet URL', () => {
      const url = sheetManager.getUrl();
      expect(url).toBe('https://example.com/sheet');
    });

    it('should handle null parent or URL', () => {
      mockSheet.getParent.mockReturnValue(null);
      expect(sheetManager.getUrl()).toBe('');

      mockSheet.getParent.mockReturnValue(mockSpreadsheet);
      mockSpreadsheet.getUrl.mockReturnValue(null);
      expect(sheetManager.getUrl()).toBe('');
    });
  });
});
