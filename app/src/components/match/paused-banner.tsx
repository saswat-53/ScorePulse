import { Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { minutesAgo } from '@/lib/dates';

/** Shown when the polling interval has widened (ADR 0001). */
export function PausedBanner({ updatedAt }: { updatedAt: string }) {
  return (
    <View className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl border border-warn/60 bg-warn/10 px-3.5 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-warn/20">
        <Icon name="pause" size={18} color="#FFB020" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-warn">Updates paused</Text>
        <Text className="mt-0.5 text-xs leading-[17px] text-soft">
          Live data is refreshing less often right now. Last updated {minutesAgo(updatedAt)} min ago.
        </Text>
      </View>
    </View>
  );
}
