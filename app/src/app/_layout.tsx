import '../global.css';

import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UpdateRequiredView } from '@/components/update-required-view';
import { useVersionGate } from '@/lib/app-version';
import { SessionProvider } from '@/state/session';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
if (!publishableKey) throw new Error('Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in app/.env');

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function Routes() {
  const gate = useVersionGate();

  // Below min_app_version the app is blocked (ADR 0007). A failed version check never blocks.
  if (gate.blocked && gate.config) {
    return <UpdateRequiredView current={gate.current} required={gate.config.minAppVersion} url={gate.config.downloadPageUrl} />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#050B18' } }} />;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar style="light" />
          <Routes />
        </SessionProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
