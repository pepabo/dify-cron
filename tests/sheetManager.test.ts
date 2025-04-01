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
};

// Google Apps Script型の部分的な実装
interface MockSpreadsheetApp {
  create(name: string): typeof mockSpreadsheet;
  getActiveSpreadsheet(): typeof mockSpreadsheet;
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
  getActiveSpreadsheet: jest.fn().mockReturnValue(mockSpreadsheet),
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

    // ヘッダー行のモック
    mockRange.getValues.mockReturnValue([Object.values(SheetColumns)]);

    sheetManager = new SheetManager(sheetName);
  });

  describe('constructor', () => {
    it('should initialize headers correctly for new sheet', () => {
      // 既存シートがない場合のシナリオ
      mockSpreadsheet.getSheetByName.mockReturnValueOnce(null);

      sheetManager = new SheetManager(sheetName);

      expect(SpreadsheetApp.create).toHaveBeenCalledWith(sheetName);
      expect(mockSheet.getRange).toHaveBeenCalled();
      expect(mockRange.setValues).toHaveBeenCalled();
      expect(mockRange.insertCheckboxes).toHaveBeenCalled();
    });

    it('should use existing sheet if available', () => {
      // 既存シートがある場合のシナリオ
      mockSpreadsheet.getSheetByName.mockReturnValueOnce(mockSheet);

      sheetManager = new SheetManager(sheetName);

      expect(SpreadsheetApp.create).not.toHaveBeenCalled();
      expect(mockSheet.getRange).toHaveBeenCalled(); // ヘッダー取得のための呼び出し
    });
  });
});
