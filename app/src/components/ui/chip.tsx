import { Pressable, Text } from 'react-native';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      className={`h-10 items-center justify-center rounded-full border px-4 ${
        active ? 'border-neon bg-neon' : 'border-border bg-surface'
      }`}>
      <Text className={`text-[13px] font-semibold ${active ? 'text-bg' : 'text-soft'}`}>{label}</Text>
    </Pressable>
  );
}
