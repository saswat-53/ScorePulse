import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state for a screen. The spinner is for the user's own pull only: the lists also refetch by
 * themselves every minute, and tying the spinner to that would flash it on a screen nobody touched.
 */
export function useManualRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, onRefresh };
}
