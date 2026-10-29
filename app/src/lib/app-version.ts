import Constants from 'expo-constants';

import { useVersionConfig } from '@/api/hooks';

import { compareVersions } from './version';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Update gating (ADR 0007). Below the minimum the app blocks; below the latest it nags.
 * If the config has not loaded or failed, nothing blocks.
 */
export function useVersionGate() {
  const { data } = useVersionConfig();
  if (!data) return { current: APP_VERSION, blocked: false, outdated: false, config: null };
  return {
    current: APP_VERSION,
    blocked: compareVersions(APP_VERSION, data.minAppVersion) < 0,
    outdated: compareVersions(APP_VERSION, data.latestAppVersion) < 0,
    config: data,
  };
}
