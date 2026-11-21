import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noSubscription = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * `useSyncExternalStore` reports "not hydrated" on the server and the first client render, then "hydrated", without
 * setting state inside an effect.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
