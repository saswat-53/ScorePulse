import { Linking, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/primary-button';
import { Icon } from '@/components/ui/icon';
import { Wordmark } from '@/components/ui/wordmark';

interface Props {
  current: string;
  required: string;
  url: string;
}

/** Blocking screen for builds below min_app_version. No way to dismiss it. */
export function UpdateRequiredView({ current, required, url }: Props) {
  return (
    <View className="flex-1 items-center bg-bg px-7 pb-10 pt-[72px]">
      <Wordmark size={30} />

      <View className="mt-[72px] h-[132px] w-[132px] items-center justify-center rounded-full border-2 border-neon/70 bg-neon/10">
        <Icon name="download" size={56} color="#19E3FF" />
      </View>

      <Text className="mt-10 text-[28px] font-extrabold text-white">Update required</Text>
      <Text className="mt-3 text-center text-[15px] leading-[23px] text-soft">
        This version of ScorePulse is no longer supported. Install the latest version to keep scores and alerts working.
      </Text>

      <View className="mt-6 w-full flex-row gap-2.5">
        <View className="flex-1 rounded-2xl border border-neon/20 bg-surface px-3.5 py-3">
          <Text className="text-[11px] text-muted">Your version</Text>
          <Text className="mt-0.5 text-base font-bold text-white">{current}</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-neon/55 bg-surface px-3.5 py-3">
          <Text className="text-[11px] text-muted">Required</Text>
          <Text className="mt-0.5 text-base font-bold text-neon">{required}</Text>
        </View>
      </View>

      <View className="flex-1" />

      <View className="w-full">
        <PrimaryButton label="Get the update" onPress={() => Linking.openURL(url)} />
      </View>
      <Text className="mt-3.5 text-center text-xs leading-[18px] text-muted">
        Opens the download page. Install over this version: you stay signed in and keep your teams.
      </Text>
    </View>
  );
}
