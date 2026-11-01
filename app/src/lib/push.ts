import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Push works in a development or release build on a phone. The web build has no push, and Expo Go on Android dropped
// it in SDK 53, so there everything below stays off instead of warning.
const PUSH_AVAILABLE = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// An alert that arrives while the app is open still shows as a banner.
if (PUSH_AVAILABLE) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Asks the system for permission to show alerts. True when the user said yes, now or earlier. */
export async function askForPushPermission(): Promise<boolean> {
  try {
    if (!PUSH_AVAILABLE || !Device.isDevice) return false;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch (e) {
    console.warn('push permission failed', e);
    return false;
  }
}

/**
 * This device's Expo push token, or null when it cannot have one: a simulator, no permission yet, or no EAS project.
 * It never asks for permission: that is `askForPushPermission`, called when the user taps Enable after picking a club.
 */
export async function getPushToken(): Promise<string | null> {
  try {
    if (!PUSH_AVAILABLE || !Device.isDevice) return null;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return null;
    if (Platform.OS === 'android') {
      // Android 8+ needs a channel before anything can be shown.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Match alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('push token skipped: no EAS projectId in the app config');
      return null;
    }
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('push token failed', e);
    return null;
  }
}
