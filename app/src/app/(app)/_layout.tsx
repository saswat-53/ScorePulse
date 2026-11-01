import { Redirect, Stack, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/state/session';

/** Everything behind sign-in. Signing out lands here and sends the user back to the sign-in screen. */
export default function AppLayout() {
  const { authLoaded, signedIn } = useSession();
  // Until Clerk has answered, "not signed in" is not an answer. Redirecting then threw away the address that was
  // asked for (a reload of /match/12, a tapped notification) and sent everyone through the sign-in screen to Home.
  if (!authLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color="#19E3FF" />
      </View>
    );
  }
  if (!signedIn) return <Redirect href={'/sign-in' as Href} />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#050B18' } }} />;
}
