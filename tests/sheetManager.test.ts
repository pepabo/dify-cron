import type { DifyApp } from '../src/types';
import { SheetManager } from '../src/sheetManager';
import { SheetColumns } from '../src/types';

// モックの設定
const mockRange = {
  setValues: jest.fn(),
  getValues: jest.fn(),
  insertCheckboxes: jest.fn(),
  setValue: jest.fn(),
};

const mockSheet = {
  getRange: jest.fn().mockReturnValue(mockRange),
  getDataRange: jest.fn().mockReturnValue(mockRange),
  getParent: jest.fn(),
  getLastRow: jest.fn().mockReturnValue(3),
  getMaxRows: jest.fn().mockReturnValue(100),
  getLastColumn: jest.fn().mockReturnValue(12),
  deleteRow: jest.fn(),
  appendRow: jest.fn(),
};

const mockSpreadsheet = {
  getActiveSheet: jest.fn().mockReturnValue(mockSheet),
  getSheetByName: jest.fn().mockReturnValue(mockSheet),
  getUrl: jest.fn().mockReturnValue('https://example.com/sheet'),
  insertSheet: jest.fn().mockReturnValue(mockSheet),
  getId: jest.fn().mockReturnValue('test-spreadsheet-id'),
};

// PropertiesServiceのモック追加
const mockPropsGetProperty = jest.fn();
const mockPropsSetProperty = jest.fn();

// Loggerのモック追加
const mockLog = jest.fn();

// モックのgetActiveSpreadsheetとopenById関数
const mockGetActiveSpreadsheet = jest.fn().mockReturnValue(mockSpreadsheet);
const mockOpenById = jest.fn().mockReturnValue(mockSpreadsheet);
const mockCreate = jest.fn().mockReturnValue(mockSpreadsheet);

// Google Apps Script型の部分的な実装
interface MockSpreadsheetApp {
  create(name: string): typeof mockSpreadsheet;
  getActiveSpreadsheet(): typeof mockSpreadsheet;
  openById(id: string): typeof mockSpreadsheet;
}

interface MockPropertiesService {
  getScriptProperties(): {
    getProperty(key: string): string | null;
    setProperty(key: string, value: string): void;
  };
}

interface MockLogger {
  log: jest.Mock;
}

interface MockUtilities {
  formatDate(date: Date, timezone: string, format: string): string;
}

// unknown経由でキャストすることで型エラーを回避
(global as unknown as { SpreadsheetApp: MockSpreadsheetApp }).SpreadsheetApp = {
  create: mockCreate,
  getActiveSpreadsheet: mockGetActiveSpreadsheet,
  openById: mockOpenById,
};

(global as unknown as { PropertiesService: MockPropertiesService }).PropertiesService = {
  getScriptProperties: () => ({
    getProperty: mockPropsGetProperty,
    setProperty: mockPropsSetProperty,
  }),
};

(global as unknown as { Logger: MockLogger }).Logger = {
  log: mockLog,
};

(global as unknown as { Utilities: MockUtilities }).Utilities = {
  formatDate: jest.fn().mockImplementation((date) => date.toISOString()),
};

describe('SheetManager', () => {
  let sheetManager: SheetManager;
  const sheetName = 'Test Sheet';

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    mockSpreadsheet.getActiveSheet.mockReturnValue(mockSheet);
    mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
    mockSheet.getParent.mockReturnValue(mockSpreadsheet);
    mockSpreadsheet.getUrl.mockReturnValue('https://example.com/sheet');
    mockSpreadsheet.insertSheet.mockReturnValue(mockSheet);
    mockGetActiveSpreadsheet.mockReturnValue(mockSpreadsheet);
    mockOpenById.mockReturnValue(mockSpreadsheet);

    // ヘッダー行のモック
    mockRange.getValues.mockReturnValue([Object.values(SheetColumns)]);

    sheetManager = new SheetManager(sheetName);
  });

  describe('constructor', () => {
    it('should initialize headers correctly for new sheet', () => {
      // 既存シートがない場合のシナリオ
      mockSpreadsheet.getSheetByName.mockReturnValueOnce(null);

      sheetManager = new SheetManager(sheetName);

      expect(mockSpreadsheet.insertSheet).toHaveBeenCalledWith(sheetName);
      expect(mockSheet.getRange).toHaveBeenCalled();
      expect(mockRange.setValues).toHaveBeenCalled();
      expect(mockRange.insertCheckboxes).toHaveBeenCalled();
    });

    it('should use existing sheet if available', () => {
      // 既存シートがある場合のシナリオ
      mockSpreadsheet.getSheetByName.mockReturnValueOnce(mockSheet);

      sheetManager = new SheetManager(sheetName);

      expect(mockSpreadsheet.insertSheet).not.toHaveBeenCalled();
      expect(mockSheet.getRange).toHaveBeenCalled(); // ヘッダー取得のための呼び出し
    });

    it('should handle the case when no active spreadsheet is available', () => {
      // ActiveSpreadsheetがない場合
      mockGetActiveSpreadsheet.mockImplementationOnce(() => {
        throw new Error('No active spreadsheet');
      });

      // 保存されたIDもない場合は新規作成
      mockPropsGetProperty.mockReturnValueOnce(null);

      sheetManager = new SheetManager(sheetName);

      expect(mockCreate).toHaveBeenCalledWith(sheetName);
      expect(mockPropsSetProperty).toHaveBeenCalled(); // IDの保存
    });

    it('should try to open spreadsheet by ID if saved', () => {
      // ActiveSpreadsheetがない場合
      mockGetActiveSpreadsheet.mockImplementationOnce(() => {
        throw new Error('No active spreadsheet');
      });

      // 保存されたIDがある場合
      const savedId = 'saved-spreadsheet-id';
      mockPropsGetProperty.mockReturnValueOnce(savedId);

      sheetManager = new SheetManager(sheetName);

      expect(mockOpenById).toHaveBeenCalledWith(savedId);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('getAllRows', () => {
    it('should return an empty array when sheet is empty', () => {
      mockSheet.getLastRow.mockReturnValueOnce(0);

      const rows = sheetManager.getAllRows();

      expect(rows).toEqual([]);
    });

    it('should return an empty array when there are only headers', () => {
      mockSheet.getLastRow.mockReturnValueOnce(1);
      mockRange.getValues.mockReturnValueOnce([Object.values(SheetColumns)]);

      const rows = sheetManager.getAllRows();

      expect(rows).toEqual([]);
    });

    it('should parse and return rows correctly', () => {
      const headerRow = Object.values(SheetColumns);
      const dataRows = [
        headerRow,
        [
          true,
          'app1',
          'App 1',
          'Test App 1',
          'api-key-1',
          '*/5',
          '*',
          '*',
          '*',
          '*',
          '{}',
          '2023-01-01',
          '2023-01-02',
        ],
        [
          false,
          'app2',
          'App 2',
          'Test App 2',
          'api-key-2',
          '0',
          '12',
          '1',
          '*',
          '1-5',
          '{"test":true}',
          '',
          '',
        ],
      ];

      mockRange.getValues.mockReturnValueOnce(dataRows);

      const rows = sheetManager.getAllRows();

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        enabled: true,
        id: 'app1',
        name: 'App 1',
        description: 'Test App 1',
        apiSecret: 'api-key-1',
        cronMinutes: '*/5',
        cronHours: '*',
        cronDayOfMonth: '*',
        cronMonth: '*',
        cronDayOfWeek: '*',
        args: '{}',
        lastSync: '2023-01-01',
        lastRun: '2023-01-02',
      });
      expect(rows[1]).toEqual({
        enabled: false,
        id: 'app2',
        name: 'App 2',
        description: 'Test App 2',
        apiSecret: 'api-key-2',
        cronMinutes: '0',
        cronHours: '12',
        cronDayOfMonth: '1',
        cronMonth: '*',
        cronDayOfWeek: '1-5',
        args: '{"test":true}',
        lastSync: '',
        lastRun: '',
      });
    });

    it('should handle missing or invalid column values', () => {
      // ヘッダーが不足している場合のテスト
      const headerRow = ['Enabled', 'ID', 'Name']; // 一部のヘッダーのみ
      const dataRows = [headerRow, [true, 'app1', 'App 1']];

      mockRange.getValues.mockReturnValueOnce(dataRows);

      const rows = sheetManager.getAllRows();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        enabled: true,
        id: 'app1',
        name: 'App 1',
        description: '',
        apiSecret: '',
        cronMinutes: '',
        cronHours: '',
        cronDayOfMonth: '',
        cronMonth: '',
        cronDayOfWeek: '',
        args: '',
        lastSync: '',
        lastRun: '',
      });
    });
  });

  describe('syncApps', () => {
    beforeEach(() => {
      // すべてのテストの前にsheetManager.getAllRowsをモックして既存のデータを返す
      const headerRow = Object.values(SheetColumns);
      const dataRows = [
        headerRow,
        [
          true,
          'app1',
          'Old App 1',
          'Old Description',
          'api-key',
          '*/5',
          '*',
          '*',
          '*',
          '*',
          '{}',
          '',
          '',
        ],
        [false, 'app2', 'App 2', 'Test App 2', '', '0', '12', '1', '*', '1-5', '', '', ''],
      ];
      mockRange.getValues.mockReturnValue(dataRows);
    });

    it('should not process empty apps array for safety', () => {
      // getAllRowsの呼び出しをリセット
      mockRange.getValues.mockClear();
      mockSheet.getRange.mockClear();
      mockSheet.deleteRow.mockClear();
      mockSheet.appendRow.mockClear();

      // 空の配列を渡してsyncAppsを呼び出す
      const apps: DifyApp[] = [];
      sheetManager.syncApps(apps);

      // APIからのデータが空でも最低限のgetRangeは実行される（現在のデータ取得のため）
      // しかし、実際の行の削除や追加は行われない
      expect(mockSheet.deleteRow).not.toHaveBeenCalled();
      expect(mockSheet.appendRow).not.toHaveBeenCalled();
    });

    it('should update existing apps', () => {
      // APIから取得したアプリ一覧
      const apps: DifyApp[] = [
        { id: 'app1', name: 'Updated App 1', description: 'Updated Description' },
      ];

      // テスト実行前にモックをクリア
      mockSheet.getRange.mockClear();
      mockRange.setValues.mockClear();

      sheetManager.syncApps(apps);

      // app1の更新を検証
      expect(mockSheet.getRange).toHaveBeenCalled();
      expect(mockRange.setValues).toHaveBeenCalled();
    });

    it('should add new apps', () => {
      // シート上に既存のアプリがあることをシミュレート
      const existingApps = [
        {
          enabled: true,
          id: 'app1',
          name: 'App 1',
          description: 'Description 1',
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

      // APIから取得した新しいアプリを含むリスト
      const apiApps: DifyApp[] = [
        { id: 'app1', name: 'App 1', description: 'Description 1' }, // 既存アプリ
        { id: 'app3', name: 'New App 3', description: 'New Description' }, // 新規アプリ
      ];

      // モックを設定
      mockSheet.getRange.mockImplementation(() => mockRange);

      // 既存データを取得するためのモック（getAllRowsの内部処理をシミュレート）
      const headerRow = Object.values(SheetColumns);
      const dataRows = [
        headerRow,
        [true, 'app1', 'App 1', 'Description 1', '', '*', '*', '*', '*', '*', '', '', ''],
      ];
      mockRange.getValues.mockReturnValueOnce(dataRows);

      // setValuesの呼び出しを記録するためのモック
      mockRange.setValues.mockClear();

      // syncAppsを実行
      sheetManager.syncApps(apiApps);

      // シート内容の更新を検証（appendRowではなくsetValues）
      expect(mockRange.setValues).toHaveBeenCalled();

      // 2つのアプリを含む配列が渡されたことを検証
      const setValuesCalls = mockRange.setValues.mock.calls[0][0];
      expect(setValuesCalls.length).toBe(2); // 2つのアプリが含まれているはず
    });
  });

  describe('getUrl', () => {
    it('should return the spreadsheet URL', () => {
      const url = sheetManager.getUrl();
      expect(url).toBe('https://example.com/sheet');
    });
  });
});
