import { Pressable, ScrollView, Text } from 'react-native';

import { LEAGUES } from '@/domain/mock';
import type { LeagueId } from '@/domain/types';

interface Props {
  value: LeagueId | 'all';
  onChange: (value: LeagueId | 'all') => void;
  includeAll?: boolean;
}

function LeagueTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={`h-11 justify-center border-b-2 px-1 ${active ? 'border-neon' : 'border-transparent'}`}>
      <Text className={`text-sm ${active ? 'font-bold text-neon' : 'font-medium text-soft'}`}>{label}</Text>
    </Pressable>
  );
}

/** League switcher as underlined text tabs, as in the mockup's home screen. */
export function LeagueChips({ value, onChange, includeAll = true }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 20 }}
      className="grow-0 border-b border-neon/10">
      {includeAll ? <LeagueTab label="All" active={value === 'all'} onPress={() => onChange('all')} /> : null}
      {LEAGUES.map((l) => (
        <LeagueTab key={l.id} label={l.shortName} active={value === l.id} onPress={() => onChange(l.id)} />
      ))}
    </ScrollView>
  );
}
