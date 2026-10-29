import { Pressable, ScrollView, Text } from 'react-native';

import type { DayChip } from '@/lib/dates';

interface Props {
  days: DayChip[];
  value: string;
  onChange: (key: string) => void;
}

export function DayStrip({ days, value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      className="grow-0">
      {days.map((d) => {
        const active = d.key === value;
        return (
          <Pressable
            key={d.key}
            onPress={() => onChange(d.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`h-[60px] w-[58px] items-center justify-center gap-0.5 rounded-2xl border ${
              active ? 'border-neon bg-neon' : 'border-border bg-surface'
            }`}>
            <Text className={`text-[11px] font-medium ${active ? 'text-bg' : 'text-muted'}`}>{d.dow}</Text>
            <Text className={`text-sm font-bold ${active ? 'text-bg' : 'text-white'}`}>{d.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
