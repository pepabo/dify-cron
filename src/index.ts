import type { DifyConfig } from './types';
import { DifyClient } from './difyClient';
import { SheetManager } from './sheetManager';

declare const PropertiesService: GoogleAppsScript.Properties.PropertiesService;
declare const Logger: GoogleAppsScript.Base.Logger;

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
 * アプリケーション一覧を取得してスプレッドシートを作成する
 */
export async function fetchAndCreateSpreadsheet() {
  try {
    const client = new DifyClient(getDifyConfig());
    const { data: apps } = await client.getApps();

    const sheetManager = new SheetManager('Dify Apps Sheet');
    sheetManager.writeApps(apps);

    Logger.log(`Spreadsheet created: ${sheetManager.getUrl()}`);
  } catch (error) {
    Logger.log(`Failed to fetch apps: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * スケジュールされたワークフローを実行する
 */
export async function executeScheduledWorkflows() {
  try {
    const client = new DifyClient(getDifyConfig());
    const sheetManager = new SheetManager('Dify Apps Sheet');
    const configs = sheetManager.readWorkflowConfigs();

    const now = new Date();
    const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now
      .getUTCMinutes()
      .toString()
      .padStart(2, '0')}`;

    for (const config of configs) {
      if (!config.schedule) continue;

      if (config.schedule === currentTime) {
        try {
          Logger.log(`Executing workflow for ${config.appId}`);
          await client.executeWorkflow(config.appId, config.args);
        } catch (error) {
          Logger.log(
            `Failed to execute workflow for ${config.appId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        Logger.log(
          `Skipping workflow for ${config.appId}: schedule ${config.schedule} != current time ${currentTime}`,
        );
      }
    }
  } catch (error) {
    Logger.log(
      `Failed to execute workflows: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
