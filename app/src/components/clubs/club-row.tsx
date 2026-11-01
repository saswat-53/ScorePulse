import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import { GLOW } from '@/components/ui/glow';
import { Icon } from '@/components/ui/icon';
import type { Team } from '@/domain/types';

interface ClubRowProps {
  team: Team;
  selected: boolean;
  onToggle: (team: Team) => void;
}

/** One club. Selected clubs get the glowing neon card from the mockup, with a remove button. */
export const ClubRow = memo(function ClubRow({ team, selected, onToggle }: ClubRowProps) {
  return (
    <View
      className={`mt-2 h-[52px] flex-row items-center gap-3 rounded-2xl border pl-3 pr-1.5 ${
        selected ? 'border-2 border-neon bg-[#0A1E3C]' : 'border-border bg-surface'
      }`}
      style={selected ? GLOW : undefined}>
      <Crest team={team} size={selected ? 38 : 34} />
      <Text numberOfLines={1} className={`flex-1 text-[15px] text-white ${selected ? 'font-bold' : 'font-semibold'}`}>
        {team.name}
      </Text>
      <Pressable
        onPress={() => onToggle(team)}
        accessibilityRole="button"
        accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${team.name}`}
        className="h-11 w-11 items-center justify-center">
        <View
          className={`h-8 w-8 items-center justify-center rounded-full ${
            selected ? 'bg-white/10' : 'border border-neon/45'
          }`}>
          <Icon name={selected ? 'close' : 'plus'} size={16} color={selected ? '#FFFFFF' : '#19E3FF'} />
        </View>
      </Pressable>
    </View>
  );
});
