import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// An alert that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Asks the system for permission to show alerts. True when the user said yes, now or earlier. */
export async function askForPushPermission(): Promise<boolean> {
  try {
    if (!Device.isDevice) return false;
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
    if (!Device.isDevice) return null;
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
