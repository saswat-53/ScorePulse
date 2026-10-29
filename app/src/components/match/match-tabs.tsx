import { Pressable, Text, View } from 'react-native';

export type MatchTab = 'overview' | 'timeline' | 'lineups' | 'stats';

const TABS: { value: MatchTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'lineups', label: 'Lineups' },
  { value: 'stats', label: 'Stats' },
];

export function MatchTabs({ value, onChange }: { value: MatchTab; onChange: (t: MatchTab) => void }) {
  return (
    <View className="mt-2.5 flex-row justify-between border-b border-neon/15 px-5">
      {TABS.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`h-11 justify-center border-b-2 ${active ? 'border-neon' : 'border-transparent'}`}>
            <Text className={`text-[13px] ${active ? 'font-bold text-neon' : 'text-muted'}`}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
