import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Whether this device has already been asked about notifications (the user tapped Enable or Not Now). The prompt after
// the first club is only for the first time: opening the club picker again from More must not bring it back.
const KEY = 'scorepulse.notificationPromptDone';

export async function notificationPromptDone(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) === '1';
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false; // unreadable: ask rather than never ask
  }
}

export async function markNotificationPromptDone() {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, '1');
    else await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // Not saved: the prompt may show once more, which is harmless.
  }
}
