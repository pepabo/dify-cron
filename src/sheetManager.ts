import type { DifyApp, AppRow } from './types';

declare const SpreadsheetApp: GoogleAppsScript.Spreadsheet.SpreadsheetApp;
declare const PropertiesService: GoogleAppsScript.Properties.PropertiesService;
declare const Logger: GoogleAppsScript.Base.Logger;
declare const Utilities: GoogleAppsScript.Utilities.Utilities;
declare const SHEET_COLUMNS: {
  readonly Enabled: string;
  readonly ID: string;
  readonly Name: string;
  readonly Description: string;
  readonly CronMinutes: string;
  readonly CronHours: string;
  readonly CronDayOfMonth: string;
  readonly CronMonth: string;
  readonly CronDayOfWeek: string;
  readonly Args: string;
  readonly LastSync: string;
  readonly LastRun: string;
  readonly APISecret: string;
};

// スクリプトプロパティのキー
const SPREADSHEET_ID_KEY = 'DIFY_SPREADSHEET_ID';

/**
 * スプレッドシート管理クラス
 */
export class SheetManager {
  readonly #sheet: GoogleAppsScript.Spreadsheet.Sheet;
  #headers: string[];

  /**
   * @param {string} sheetName スプレッドシート名
   * @throws {Error} スプレッドシートの作成に失敗した場合
   */
  constructor(sheetName: string) {
    let spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;
    let sheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;

    try {
      // 1. まずActiveSpreadsheetを試す
      spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      Logger.log(`No active spreadsheet: ${e}`);
      spreadsheet = null;
    }

    // 2. 保存されたIDからスプレッドシートを取得
    if (!spreadsheet) {
      try {
        const props = PropertiesService.getScriptProperties();
        const savedId = props.getProperty(SPREADSHEET_ID_KEY);
        if (savedId) {
          Logger.log(`Trying to open spreadsheet by ID: ${savedId}`);
          spreadsheet = SpreadsheetApp.openById(savedId);
        }
      } catch (e) {
        Logger.log(`Failed to open spreadsheet by ID: ${e}`);
        spreadsheet = null;
      }
    }

    // 3. スプレッドシートを新規作成
    if (!spreadsheet) {
      Logger.log(`Creating new spreadsheet: ${sheetName}`);
      spreadsheet = SpreadsheetApp.create(sheetName);

      // IDを保存
      if (spreadsheet) {
        try {
          const props = PropertiesService.getScriptProperties();
          props.setProperty(SPREADSHEET_ID_KEY, spreadsheet.getId());
          Logger.log(`Saved new spreadsheet ID: ${spreadsheet.getId()}`);
        } catch (e) {
          Logger.log(`Failed to save spreadsheet ID: ${e}`);
        }
      }
    }

    if (!spreadsheet) {
      throw new Error('Failed to get or create spreadsheet');
    }

    // 指定シートの取得または作成
    sheet = spreadsheet.getSheetByName(sheetName);

    // headerを明示的に設定
    // 既存の列やグローバル変数の定義を考慮して決定
    const defaultHeaders = Object.values(SHEET_COLUMNS);

    if (!sheet) {
      // 既存のスプレッドシートに新しいシートを追加
      Logger.log(`Adding new sheet: ${sheetName}`);
      sheet = spreadsheet.insertSheet(sheetName);
      this.#headers = defaultHeaders;
      Logger.log(`Initializing headers for new sheet: ${defaultHeaders.join(', ')}`);
      this.#initializeHeaders(sheet);
    } else {
      // シートが空かどうかチェック
      if (sheet.getLastRow() === 0) {
        // シートは存在するが中身がないのでヘッダーを初期化
        Logger.log(`Sheet exists but is empty. Initializing headers: ${defaultHeaders.join(', ')}`);
        this.#headers = defaultHeaders;
        this.#initializeHeaders(sheet);
      } else {
        // 既存シートのヘッダーを取得
        try {
          // ヘッダ行が存在する場合
          const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
          const headerValues = headerRange.getValues()[0];
          Logger.log(`Found existing headers: ${headerValues.join(', ')}`);
          this.#headers = [...headerValues];
        } catch (e) {
          // ヘッダー取得に失敗した場合はデフォルト値を使用
          Logger.log(`Failed to get existing headers: ${e}. Using defaults.`);
          this.#headers = defaultHeaders;
          this.#initializeHeaders(sheet);
        }
      }
    }

    if (!sheet) {
      throw new Error(`Failed to get or create sheet: ${sheetName}`);
    }

    this.#sheet = sheet;
    Logger.log(`Successfully initialized sheet: ${sheetName} with ${this.#headers.length} columns`);
  }

  /**
   * スプレッドシートのヘッダーを初期化する
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 対象シート
   * @private
   */
  #initializeHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
    try {
      Logger.log(`Setting headers: ${this.#headers.join(', ')}`);
      if (this.#headers.length === 0) {
        Logger.log('No headers to initialize');
        return;
      }

      const range = sheet.getRange(1, 1, 1, this.#headers.length);
      const headerValues = [...this.#headers];
      range.setValues([headerValues]);

      // Enabled 列をチェックボックスにする
      const enabledColIndex = this.#getColumnIndex(SHEET_COLUMNS.Enabled);
      if (enabledColIndex !== -1) {
        // 最大行数-1がマイナスにならないようにする（1行しかない場合）
        const maxRows = Math.max(1, sheet.getMaxRows() - 1);
        if (maxRows > 0) {
          sheet.getRange(2, enabledColIndex + 1, maxRows, 1).insertCheckboxes();
        }
      }

      Logger.log('Headers initialized successfully');
    } catch (e) {
      Logger.log(`Error initializing headers: ${e}`);
    }
  }

  /**
   * 列名から列インデックスを取得する (0-based)
   * @param {string} columnName 列名
   * @returns {number} 列インデックス。見つからない場合は -1
   * @private
   */
  #getColumnIndex(columnName: string): number {
    return this.#headers.indexOf(columnName);
  }

  /**
   * すべての行データを取得する
   * @returns {readonly AppRow[]} 行データ一覧
   */
  getAllRows(): readonly AppRow[] {
    // シートが空の場合やヘッダーがない場合の対応
    if (this.#sheet.getLastRow() === 0 || this.#sheet.getLastColumn() === 0) {
      Logger.log('Sheet is empty or has no columns');
      return Object.freeze([]);
    }

    try {
      const dataRange = this.#sheet.getDataRange();
      if (!dataRange) {
        Logger.log('Failed to get data range');
        return Object.freeze([]);
      }

      const values = dataRange.getValues();
      if (!values || values.length === 0) {
        Logger.log('No values in data range');
        return Object.freeze([]);
      }

      if (values.length <= 1) {
        Logger.log('Only header row exists');
        return Object.freeze([]); // ヘッダーのみの場合は空配列
      }

      const rows = values.slice(1).map((row): AppRow => {
        // インデックスがマイナスにならないよう対策
        const getColumnValue = (columnName: string) => {
          const index = this.#getColumnIndex(columnName);
          return index >= 0 && index < row.length ? row[index] : '';
        };

        return {
          enabled: Boolean(getColumnValue(SHEET_COLUMNS.Enabled)),
          id: String(getColumnValue(SHEET_COLUMNS.ID) || ''),
          name: String(getColumnValue(SHEET_COLUMNS.Name) || ''),
          description: String(getColumnValue(SHEET_COLUMNS.Description) || ''),
          apiSecret: String(getColumnValue(SHEET_COLUMNS.APISecret) || ''),
          cronMinutes: String(getColumnValue(SHEET_COLUMNS.CronMinutes) || ''),
          cronHours: String(getColumnValue(SHEET_COLUMNS.CronHours) || ''),
          cronDayOfMonth: String(getColumnValue(SHEET_COLUMNS.CronDayOfMonth) || ''),
          cronMonth: String(getColumnValue(SHEET_COLUMNS.CronMonth) || ''),
          cronDayOfWeek: String(getColumnValue(SHEET_COLUMNS.CronDayOfWeek) || ''),
          args: String(getColumnValue(SHEET_COLUMNS.Args) || ''),
          lastSync: String(getColumnValue(SHEET_COLUMNS.LastSync) || ''),
          lastRun: String(getColumnValue(SHEET_COLUMNS.LastRun) || ''),
        };
      });

      return Object.freeze(rows);
    } catch (e) {
      Logger.log(`Error in getAllRows: ${e}`);
      return Object.freeze([]);
    }
  }

  /**
   * スプレッドシートを Dify アプリ一覧で更新する
   * @param {readonly DifyApp[]} apps Dify アプリ一覧
   */
  syncApps(apps: readonly DifyApp[]): void {
    try {
      Logger.log(`Syncing ${apps.length} Dify apps`);

      // APIから取得したアプリが0件の場合は安全のために処理を中断
      if (apps.length === 0) {
        Logger.log('WARNING: No apps retrieved from API. Skipping sync to prevent mass deletion.');
        return;
      }

      // シートが初期化されていない場合はヘッダーを再初期化
      if (this.#sheet.getLastRow() === 0 || this.#headers.length === 0) {
        Logger.log('Sheet is empty, reinitializing headers');
        this.#headers = [...Object.values(SHEET_COLUMNS)];
        this.#initializeHeaders(this.#sheet);
      }

      const existingRows = this.getAllRows();
      Logger.log(`Found ${existingRows.length} existing rows in sheet`);

      // 既存のIDをログに出力（先頭10件）
      if (existingRows.length > 0) {
        const sampleIds = existingRows.slice(0, 10).map((row) => row.id);
        Logger.log(`Sample existing IDs (first 10): ${JSON.stringify(sampleIds)}`);
      }

      // API取得アプリのIDをログ出力（先頭10件）
      if (apps.length > 0) {
        const sampleApiIds = apps.slice(0, 10).map((app) => app.id);
        Logger.log(`Sample API IDs (first 10): ${JSON.stringify(sampleApiIds)}`);
      }

      const now = new Date().toISOString();

      // 削除行と更新行のアプローチを変更する
      // 既存データと新データのマージを行い、一度にシートを更新する

      // 既存データをID→行データのマップに変換
      const existingRowMap = new Map<string, AppRow>();
      for (const row of existingRows) {
        if (row.id) {
          existingRowMap.set(row.id, row);
        }
      }

      // マージ後のデータを準備
      const mergedData: AppRow[] = [];

      // APIから取得したアプリを優先的に追加/更新
      for (const app of apps) {
        const existingRow = existingRowMap.get(app.id);

        if (existingRow) {
          // 既存行を更新
          mergedData.push({
            ...existingRow,
            name: app.name,
            description: app.description || '',
            apiSecret: '',
            lastSync: now,
          });
        } else {
          // 新規行を追加
          mergedData.push({
            enabled: false,
            id: app.id,
            name: app.name,
            description: app.description || '',
            apiSecret: '',
            cronMinutes: '',
            cronHours: '',
            cronDayOfMonth: '',
            cronMonth: '',
            cronDayOfWeek: '',
            args: '',
            lastSync: now,
            lastRun: '',
          });
        }

        // 処理済みのIDをマップから削除
        existingRowMap.delete(app.id);
      }

      Logger.log(`Merged ${mergedData.length} rows from API data`);

      // シートを更新する（全削除＆全追加）
      const startRow = 2; // ヘッダー行の後
      const totalRows = this.#sheet.getLastRow();

      if (totalRows > 1) {
        // ヘッダー以外の行をクリア
        try {
          Logger.log(`Clearing sheet data (rows 2-${totalRows})`);
          this.#sheet.getRange(2, 1, totalRows - 1, this.#headers.length).clearContent();
        } catch (e) {
          Logger.log(`Error clearing sheet: ${e}`);
        }
      }

      if (mergedData.length > 0) {
        try {
          Logger.log(`Writing ${mergedData.length} rows to sheet`);

          // データを2次元配列に変換
          const values = mergedData.map((row) => {
            const rowValues: unknown[] = Array(this.#headers.length).fill('');

            // ヘッダーのインデックスを確認しながら格納
            const setColumnValue = (columnName: string, value: unknown) => {
              const index = this.#getColumnIndex(columnName);
              if (index >= 0 && index < rowValues.length) {
                rowValues[index] = value;
              }
            };

            setColumnValue(SHEET_COLUMNS.Enabled, row.enabled);
            setColumnValue(SHEET_COLUMNS.ID, row.id);
            setColumnValue(SHEET_COLUMNS.Name, row.name);
            setColumnValue(SHEET_COLUMNS.Description, row.description);
            setColumnValue(SHEET_COLUMNS.APISecret, row.apiSecret);
            setColumnValue(SHEET_COLUMNS.CronMinutes, row.cronMinutes);
            setColumnValue(SHEET_COLUMNS.CronHours, row.cronHours);
            setColumnValue(SHEET_COLUMNS.CronDayOfMonth, row.cronDayOfMonth);
            setColumnValue(SHEET_COLUMNS.CronMonth, row.cronMonth);
            setColumnValue(SHEET_COLUMNS.CronDayOfWeek, row.cronDayOfWeek);
            setColumnValue(SHEET_COLUMNS.Args, row.args);
            setColumnValue(SHEET_COLUMNS.LastSync, row.lastSync);
            setColumnValue(SHEET_COLUMNS.LastRun, row.lastRun);

            return rowValues;
          });

          // データの書き込み
          this.#sheet.getRange(startRow, 1, values.length, this.#headers.length).setValues(values);

          // Enabled 列のチェックボックス設定
          const enabledColIndex = this.#getColumnIndex(SHEET_COLUMNS.Enabled);
          if (enabledColIndex !== -1) {
            this.#sheet
              .getRange(startRow, enabledColIndex + 1, values.length, 1)
              .insertCheckboxes();
          }

          Logger.log('Data written successfully');
        } catch (e) {
          Logger.log(`Error writing data to sheet: ${e}`);
        }
      } else {
        Logger.log('No data to write to the sheet');
      }

      Logger.log('Sync completed successfully');
    } catch (e) {
      Logger.log(`Error in syncApps: ${e}`);
    }
  }

  /**
   * 指定した行の最終実行日時を更新する
   * @param {string} appId アプリID
   * @param {string} runTime 実行日時 (ISO形式)
   */
  updateLastRun(appId: string, runTime: string): void {
    try {
      const rows = this.getAllRows();
      const rowIndex = rows.findIndex((row) => row.id === appId);

      if (rowIndex === -1) {
        Logger.log(`No row found with appId: ${appId}`);
        return;
      }

      const sheetRowIndex = rowIndex + 2; // ヘッダーと0-based indexのため
      const lastRunColIndex = this.#getColumnIndex(SHEET_COLUMNS.LastRun);

      if (lastRunColIndex === -1) {
        Logger.log('LastRun column not found');
        return;
      }

      Logger.log(`Updating LastRun for app ${appId} at row ${sheetRowIndex}`);
      this.#sheet.getRange(sheetRowIndex, lastRunColIndex + 1).setValue(runTime);
    } catch (e) {
      Logger.log(`Error in updateLastRun: ${e}`);
    }
  }

  /**
   * スプレッドシートのURLを取得する
   * @returns {string} スプレッドシートのURL
   */
  getUrl(): string {
    return this.#sheet.getParent()?.getUrl() ?? '';
  }
}
