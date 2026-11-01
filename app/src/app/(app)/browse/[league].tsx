import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useLeagueClubs } from '@/api/hooks';
import { ClubRow } from '@/components/clubs/club-row';
import { Crest } from '@/components/ui/crest';
import { Icon } from '@/components/ui/icon';
import { RoundButton } from '@/components/ui/round-button';
import { Screen } from '@/components/ui/screen';
import { MAX_FAVORITES, type LeagueId, type Team } from '@/domain/types';
import { useSession } from '@/state/session';

/** A league's clubs. Opened from the club picker (`pick`) a club is chosen as a favorite; otherwise it opens the team's page. */
export default function LeagueClubs() {
  const { league, pick } = useLocalSearchParams<{ league: LeagueId; pick?: string }>();
  const { data, isLoading } = useLeagueClubs(league);
  const { favoriteTeams, toggleFavorite } = useSession();
  const [limitHit, setLimitHit] = useState(false);
  const chosen = favoriteTeams.map((t) => t.id);

  const onToggle = async (team: Team) => setLimitHit(!(await toggleFavorite(team)));

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-3">
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        <Text className="flex-1 text-xl font-extrabold text-white">{data?.league.name ?? ''}</Text>
        {pick ? (
          <Text className="text-xs font-bold tracking-widest text-neon">
            {chosen.length}/{MAX_FAVORITES}
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#19E3FF" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {limitHit ? (
            <Text className="mt-3 text-xs text-warn">You can pick up to {MAX_FAVORITES} clubs. Remove one first.</Text>
          ) : null}
          {data?.teams.map((team) =>
            pick ? (
              <ClubRow key={team.id} team={team} selected={chosen.includes(team.id)} onToggle={onToggle} />
            ) : (
              <Pressable
                key={team.id}
                onPress={() => router.push(`/team/${team.id}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={`${team.name}: season`}
                className="mt-2 h-[52px] flex-row items-center gap-3 rounded-2xl border border-border bg-surface pl-3 pr-3">
                <Crest team={team} size={34} />
                <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-white">
                  {team.name}
                </Text>
                <Icon name="chevron-right" size={18} color="#8FA3C0" />
              </Pressable>
            ),
          )}
          {data && data.teams.length === 0 ? (
            <Text className="mt-10 text-center text-[13px] text-muted">
              No clubs yet. They appear once the daily update has stored this league's table.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
