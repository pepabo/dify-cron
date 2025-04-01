import type { DifyApp, WorkflowConfig } from './types';
import { SheetColumns, type SheetColumnValue } from './types';

declare const SpreadsheetApp: GoogleAppsScript.Spreadsheet.SpreadsheetApp;

/**
 * スプレッドシート管理クラス
 */
export class SheetManager {
  readonly #sheet: GoogleAppsScript.Spreadsheet.Sheet;
  static readonly #COLUMNS: readonly SheetColumnValue[] = [
    SheetColumns.ID,
    SheetColumns.Name,
    SheetColumns.Description,
    SheetColumns.Schedule,
    SheetColumns.Args,
  ];

  /**
   * @param {string} sheetName スプレッドシート名
   * @throws {Error} スプレッドシートの作成に失敗した場合
   */
  constructor(sheetName: string) {
    const spreadsheet = SpreadsheetApp.create(sheetName);
    if (!spreadsheet) {
      throw new Error(`Failed to create spreadsheet: ${sheetName}`);
    }
    this.#sheet = spreadsheet.getActiveSheet();
    this.#initializeHeaders();
  }

  /**
   * スプレッドシートのヘッダーを初期化する
   * @private
   */
  #initializeHeaders(): void {
    const range = this.#sheet.getRange(1, 1, 1, SheetManager.#COLUMNS.length);
    range.setValues([[...SheetManager.#COLUMNS]]);
  }

  /**
   * アプリケーション一覧をスプレッドシートに書き込む
   * @param {readonly DifyApp[]} apps アプリケーション一覧
   */
  writeApps(apps: readonly DifyApp[]): void {
    if (apps.length === 0) return;

    const values = apps.map((app) => [app.id, app.name, app.description || '', '', '']);

    const range = this.#sheet.getRange(2, 1, values.length, 5);
    range.setValues(values);
  }

  /**
   * ワークフロー設定をスプレッドシートから読み込む
   * @returns {readonly WorkflowConfig[]} ワークフロー設定一覧
   */
  readWorkflowConfigs(): readonly WorkflowConfig[] {
    const dataRange = this.#sheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length <= 1) return Object.freeze([]); // ヘッダーのみの場合は空配列を返す

    // ヘッダー行をスキップ
    const configs = values.slice(1).map((row) => {
      const config = {
        appId: String(row[0]),
        schedule: String(row[3] ?? ''),
        args: row[4] ? JSON.parse(String(row[4])) : {},
      };
      return Object.freeze(config);
    });

    return Object.freeze(configs);
  }

  /**
   * スプレッドシートのURLを取得する
   * @returns {string} スプレッドシートのURL
   */
  getUrl(): string {
    return this.#sheet.getParent()?.getUrl() ?? '';
  }
}
