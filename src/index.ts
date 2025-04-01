import type { DifyConfig, AppRow } from './types';
import { DifyClient } from './difyClient';
import { SheetManager } from './sheetManager';

declare const PropertiesService: GoogleAppsScript.Properties.PropertiesService;
declare const Logger: GoogleAppsScript.Base.Logger;
declare const ScriptApp: GoogleAppsScript.Script.ScriptApp;

const SHEET_NAME = 'Dify Apps Sheet';
const SYNC_TRIGGER_FUNCTION = 'syncDifyApps';
const CRON_TRIGGER_FUNCTION = 'checkAndRunCronJobs';

/**
 * スクリプトプロパティからDifyの設定を取得する
 * @returns {DifyConfig} Difyの設定
 * @throws {Error} 必要な設定が不足している場合
 */
function getDifyConfig() {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = properties.getProperty('DIFY_BASE_URL');
  const username = properties.getProperty('DIFY_USERNAME');
  const password = properties.getProperty('DIFY_PASSWORD');

  if (!baseUrl || !username || !password) {
    throw new Error('Missing required configuration');
  }

  return { baseUrl, username, password };
}

/**
 * Difyアプリ一覧とスプレッドシートを同期する
 */
export async function syncDifyApps() {
  try {
    const client = new DifyClient(getDifyConfig());
    const { data: apps } = await client.getApps();
    const sheetManager = new SheetManager(SHEET_NAME);
    sheetManager.syncApps(apps);
    Logger.log('Dify apps synced successfully.');
  } catch (error) {
    Logger.log(
      `Failed to sync Dify apps: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Cron設定に合致するかチェックする
 * @param {Date} date 現在日時
 * @param {AppRow} cronConfig Cron設定を含む行データ
 * @returns {boolean} 合致すれば true
 */
export function isCronMatch(date: Date, cronConfig: AppRow): boolean {
  const cronParts = [
    cronConfig.cronMinutes,
    cronConfig.cronHours,
    cronConfig.cronDayOfMonth,
    cronConfig.cronMonth,
    cronConfig.cronDayOfWeek,
  ];
  const dateParts = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1, // getMonthは0-11
    date.getDay(), // getDayは0-6 (日曜=0)
  ];

  for (let i = 0; i < cronParts.length; i++) {
    const cronValue = cronParts[i];
    const dateValue = dateParts[i];

    if (cronValue === '' || cronValue === '*') continue; // 空またはワイルドカードは無視

    // カンマ区切り、範囲指定 (ハイフン)、ステップ指定 (スラッシュ) を考慮
    const match = cronValue.split(',').some((part) => {
      if (part.includes('/')) {
        // ステップ指定 e.g. */5
        const [range, stepStr] = part.split('/');
        const step = Number.parseInt(stepStr, 10);
        if (Number.isNaN(step) || step <= 0) return false; // 無効なステップ
        if (range === '*') {
          return dateValue % step === 0;
        }
        if (range.includes('-')) {
          // 範囲内のステップ e.g. 0-59/5
          const [start, end] = range.split('-').map(Number);
          return dateValue >= start && dateValue <= end && (dateValue - start) % step === 0;
        }
        // 特定の値のステップ？ (通常は範囲と組み合わせる) - 一旦無視
        return false;
      }
      if (part.includes('-')) {
        // 範囲指定 e.g. 1-5
        const [start, end] = part.split('-').map(Number);
        return dateValue >= start && dateValue <= end;
      }
      // 単一の値 e.g. 5
      return Number.parseInt(part, 10) === dateValue;
    });

    if (!match) return false; // 一致しない部分があれば全体が不一致
  }

  return true; // 全ての部分で一致
}

/**
 * スケジュールされたワークフローを実行する
 */
export async function checkAndRunCronJobs() {
  try {
    const sheetManager = new SheetManager(SHEET_NAME);
    const rows = sheetManager.getAllRows();
    const client = new DifyClient(getDifyConfig());
    const now = new Date();
    const runTime = now.toISOString();

    for (const row of rows) {
      if (!row.enabled) continue; // Enabledでないものはスキップ

      if (isCronMatch(now, row)) {
        try {
          Logger.log(`Executing workflow for ${row.id}`);
          const args = row.args ? JSON.parse(row.args) : {};

          // APIシークレットが設定されている場合はAPIキーを使用
          if (row.apiSecret) {
            Logger.log(`Using API key for app ${row.id}`);
            await client.executeWorkflowWithApiKey(
              row.id,
              row.apiSecret,
              args,
              'blocking', // レスポンスモード（blocking/streaming）
              `cron-job-${row.id}`, // ユーザー識別子としてアプリIDを使用
            );
          } else {
            Logger.log(`No API key found, using admin credentials for app ${row.id}`);
            await client.executeWorkflow(row.id, args);
          }

          sheetManager.updateLastRun(row.id, runTime);
        } catch (error) {
          Logger.log(
            `Failed to execute workflow for ${row.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  } catch (error) {
    Logger.log(
      `Failed to check and run cron jobs: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

/**
 * 既存のトリガーを削除するヘルパー関数
 * @param {string} functionName トリガーハンドラー名
 */
function deleteExistingTriggers(functionName: string): void {
  const triggersToDelete = ScriptApp.getProjectTriggers().filter(
    (trigger) => trigger.getHandlerFunction() === functionName,
  );
  for (const trigger of triggersToDelete) {
    ScriptApp.deleteTrigger(trigger);
  }
}

/**
 * Dify同期用の時間ベーストリガーを作成する (例: 1時間ごと)
 */
export function createSyncTrigger() {
  deleteExistingTriggers(SYNC_TRIGGER_FUNCTION);
  ScriptApp.newTrigger(SYNC_TRIGGER_FUNCTION).timeBased().everyHours(1).create();
  Logger.log(`Created trigger for ${SYNC_TRIGGER_FUNCTION} to run every hour.`);
}

/**
 * Cron実行用の時間ベーストリガーを作成する (1分ごと)
 */
export function createCronTrigger() {
  deleteExistingTriggers(CRON_TRIGGER_FUNCTION);
  ScriptApp.newTrigger(CRON_TRIGGER_FUNCTION).timeBased().everyMinutes(1).create();
  Logger.log(`Created trigger for ${CRON_TRIGGER_FUNCTION} to run every minute.`);
}
