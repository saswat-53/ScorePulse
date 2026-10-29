import { Text, View } from 'react-native';

import { GLOW } from '@/components/ui/glow';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';

/** The "not live-tracked, tap Follow" state for a match the poller does not read. */
export function NotLiveCard({ onFollow }: { onFollow: () => void }) {
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-neon/55 bg-surface p-4" style={GLOW}>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-neon/10">
          <Icon name="info" size={20} color="#19E3FF" />
        </View>
        <View>
          <Text className="text-[15px] font-bold text-white">Not live-tracked</Text>
          <Text className="mt-0.5 text-xs text-soft">Showing saved match info only.</Text>
        </View>
      </View>
      <Text className="mt-3 text-[13px] leading-5 text-soft">
        Tap Follow to get the live score, a full timeline and alerts for goals, cards and full time.
      </Text>
      <View className="mt-3.5">
        <PrimaryButton label="Follow match" icon="bell" onPress={onFollow} />
      </View>
    </View>
  );
}

export function LockedTimeline() {
  return (
    <View className="mx-4 mt-4 h-24 overflow-hidden rounded-2xl border border-dashed border-neon/30 bg-surface/60">
      <View className="gap-2.5 px-4 py-3.5 opacity-25">
        <View className="h-3 w-3/5 rounded-md bg-muted" />
        <View className="h-3 w-4/5 rounded-md bg-muted" />
        <View className="h-3 w-[45%] rounded-md bg-muted" />
      </View>
      <View className="absolute inset-0 flex-row items-center justify-center gap-2">
        <Icon name="lock" size={18} color="#B9C6E0" />
        <Text className="text-[13px] font-semibold text-soft">Timeline unlocks when you follow</Text>
      </View>
    </View>
  );
}
