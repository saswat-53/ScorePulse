import { Pressable, Text, View } from 'react-native';

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View className="flex-row gap-1 rounded-2xl border border-border bg-surface p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`h-10 flex-1 items-center justify-center rounded-xl ${active ? 'bg-neon' : ''}`}>
            <Text className={`text-sm ${active ? 'font-bold text-bg' : 'font-semibold text-muted'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
