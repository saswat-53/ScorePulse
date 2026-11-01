import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { Team } from '@/domain/types';

/**
 * Team badge. The image comes from the crest URL the server stores for each team (the `team_map` table), and is kept
 * on the device after the first load. A team with no image, or one that fails to load, gets a ring in the team colour
 * with its code instead.
 */
export function Crest({ team, size = 28 }: { team: Team; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (team.crestUrl && !failed) {
    // A light disc behind the badge, so a dark crest does not disappear into the dark screen.
    return (
      <View
        accessibilityLabel={team.name}
        className="items-center justify-center"
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#F4F4F8' }}>
        <Image
          source={team.crestUrl}
          contentFit="contain"
          cachePolicy="disk"
          onError={() => setFailed(true)}
          style={{ width: size * 0.74, height: size * 0.74 }}
        />
      </View>
    );
  }

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
