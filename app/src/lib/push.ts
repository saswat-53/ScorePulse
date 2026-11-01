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

/**
 * This device's Expo push token, or null when it cannot have one: a simulator, no permission yet, or no EAS project.
 * It never asks for permission; the prompt belongs to the alert settings (#14), which calls this again once the user
 * has said yes.
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
