import { Redirect, Stack, type Href } from 'expo-router';

import { useSession } from '@/state/session';

/** Everything behind sign-in. Signing out lands here and sends the user back to the sign-in screen. */
export default function AppLayout() {
  const { signedIn } = useSession();
  if (!signedIn) return <Redirect href={'/sign-in' as Href} />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#050B18' } }} />;
}
