import { Text, View } from 'react-native';

// Phase 1 placeholder: proves NativeWind classes resolve. Replaced by the fixtures screen in Phase 3.
export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <Text className="text-4xl font-bold text-neon">ScorePulse</Text>
      <Text className="mt-2 text-sm tracking-widest text-muted">FOOTBALL. LIVE. ALWAYS ON.</Text>
    </View>
  );
}
