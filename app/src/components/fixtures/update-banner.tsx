import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { GLOW_SOFT } from '@/components/ui/glow';
import { Icon } from '@/components/ui/icon';
import { useVersionGate } from '@/lib/app-version';

/** Dismissible "new version" banner. Links to the showcase page, never straight to Drive. */
export function UpdateBanner() {
  const { outdated, config } = useVersionGate();
  const [dismissed, setDismissed] = useState(false);
  if (!outdated || !config || dismissed) return null;

  return (
    <View
      className="mx-4 mt-3 h-[72px] flex-row items-center gap-2.5 rounded-2xl border border-neon/55 bg-surface-2 pl-3 pr-1"
      style={GLOW_SOFT}>
      <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-neon/10">
        <Icon name="download" size={20} color="#19E3FF" />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-bold text-white">New version available</Text>
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-soft">
          {config.latestAppVersion} · New features, faster alerts
        </Text>
      </View>
      <Pressable
        onPress={() => Linking.openURL(config.downloadPageUrl)}
        accessibilityRole="button"
        className="h-11 items-center justify-center rounded-xl border border-neon bg-neon/15 px-3.5">
        <Text className="text-[13px] font-bold text-white">Update</Text>
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="h-11 w-11 items-center justify-center">
        <Icon name="close" size={18} color="#8FA3C0" />
      </Pressable>
    </View>
  );
}
