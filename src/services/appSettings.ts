import { invoke } from '@tauri-apps/api/core';
import type { AppLocale } from '../i18n/index';

export type GuiSettings = {
  host: string;
  port: number;
  runOnStartup: boolean;
  allowLan: boolean;
  closeBehavior: 'ask' | WindowsCloseAction;
  deepseekHarnessProfile: string;
};

export type WindowsCloseAction = 'exit' | 'minimize-to-tray';

export const setAppLocale = (args: { locale: AppLocale; }): Promise<string> =>
  invoke<string>('set_app_locale', args);

export const openExternalUrl = (args: { url: string; }): Promise<void> =>
  invoke<void>('open_external_url', args);

export const getGuiSettings = (): Promise<GuiSettings> =>
  invoke<GuiSettings>('get_gui_settings');

export const listDeepSeekHarnessProfiles = (): Promise<string[]> =>
  invoke<string[]>('list_deepseek_harness_profiles');

export const saveDeepSeekHarnessProfile = (profile: string): Promise<GuiSettings> =>
  invoke<GuiSettings>('save_deepseek_harness_profile', { profile });

export const resolveWindowsCloseRequest = (args: { action: WindowsCloseAction; remember: boolean; }): Promise<void> =>
  invoke<void>('resolve_windows_close_request', args);
