import { Redirect, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Wordmark } from '@/components/ui/wordmark';
import { useSession } from '@/state/session';

export default function SignIn() {
  const { signedIn, signIn } = useSession();
  if (signedIn) return <Redirect href={'/' as Href} />;
  return (
    <View className="flex-1 bg-bg px-6 pb-8 pt-24">
      <View className="items-center">
        <Wordmark size={42} />
        <Text className="mt-2.5 text-[11px] font-semibold tracking-[3px] text-neon">
          FOOTBALL. LIVE. ALWAYS ON.
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="h-[220px] w-[220px] items-center justify-center rounded-full border border-neon/30 bg-neon/5">
          <View className="h-[160px] w-[160px] items-center justify-center rounded-full border border-neon/50 bg-neon/10">
            <View className="h-[100px] w-[100px] items-center justify-center rounded-full border-2 border-neon/80 bg-neon/15">
              <Icon name="whistle" size={44} color="#19E3FF" />
            </View>
          </View>
        </View>
      </View>

      <Text className="text-[30px] font-extrabold italic leading-[33px] text-neon">YOUR{'\n'}FOOTBALL{'\n'}TERMINAL</Text>
      <Text className="mb-6 mt-3 text-[15px] leading-[22px] text-muted">
        Live scores. Real-time alerts.{'\n'}Personalised for you.
      </Text>

      <Pressable
        onPress={signIn}
        accessibilityRole="button"
        className="h-[52px] items-center justify-center rounded-2xl bg-white">
        <Text className="text-[15px] font-bold text-bg">Continue with Google</Text>
      </Pressable>
      <Pressable
        onPress={signIn}
        accessibilityRole="button"
        className="mt-3 h-[52px] items-center justify-center rounded-2xl border border-border bg-surface">
        <Text className="text-[15px] font-semibold text-white">Continue with Email</Text>
      </Pressable>

      <Text className="mt-5 text-center text-[11px] leading-4 text-muted">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}
