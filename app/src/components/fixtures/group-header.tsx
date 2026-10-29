import { Text, View } from 'react-native';

export function GroupHeader({ title }: { title: string }) {
  return (
    <View className="mt-4 flex-row items-center gap-2">
      <View className="h-1.5 w-1.5 rounded-full bg-neon" />
      <Text className="text-xs font-bold tracking-widest text-neon">{title.toUpperCase()}</Text>
    </View>
  );
}
