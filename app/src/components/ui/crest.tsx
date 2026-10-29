import { Text, View } from 'react-native';

import type { Team } from '@/domain/types';

/** Team badge: a ring in the team colour with its code, until real crest images exist. */
export function Crest({ team, size = 28 }: { team: Team; size?: number }) {
  return (
    <View
      accessibilityLabel={team.name}
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: size >= 40 ? 2.5 : 2,
        borderColor: team.color,
        backgroundColor: `${team.color}33`,
      }}>
      <Text className="font-bold text-white" style={{ fontSize: Math.max(8, size * 0.3) }}>
        {team.code}
      </Text>
    </View>
  );
}
