import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useTeamFixtures } from '@/api/hooks';
import { LeagueChips } from '@/components/fixtures/league-chips';
import { FixtureRow } from '@/components/fixtures/fixture-row';
import { GroupHeader } from '@/components/fixtures/group-header';
import { Crest } from '@/components/ui/crest';
import { RoundButton } from '@/components/ui/round-button';
import { Screen } from '@/components/ui/screen';
import type { LeagueId } from '@/domain/types';
import { monthLabel } from '@/lib/dates';
import { useSession } from '@/state/session';

/** A team's whole season: every fixture and result stored for it, newest first, by month. Tap one for the match. */
export default function TeamPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useTeamFixtures(Number(id));
  const { profile } = useSession();
  const [league, setLeague] = useState<LeagueId | 'all'>('all');

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#19E3FF" />
        </View>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <View className="px-3">
          <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        </View>
        <Text className="mt-24 text-center text-sm text-muted">This team could not be found.</Text>
      </Screen>
    );
  }

  const { team, fixtures } = data;
  const leagues = [...new Set(fixtures.map((f) => f.leagueId))];
  const shown = fixtures
    .filter((f) => league === 'all' || f.leagueId === league)
    .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc)); // newest first
  const months = [...new Set(shown.map((f) => monthLabel(f.kickoffUtc)))];
  const mine = profile.favoriteTeamIds.includes(team.id);
  const played = fixtures.filter((f) => f.status === 'finished').length;

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-3">
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
      </View>
      <View className="items-center px-4 pb-3 pt-1">
        <Crest team={team} size={64} />
        <Text className="mt-2 text-xl font-extrabold text-white">{team.name}</Text>
        <Text className="mt-0.5 text-xs text-muted">
          {mine ? 'Your club · ' : ''}
          {played} played · {fixtures.length - played} to come
        </Text>
      </View>

      {leagues.length > 1 ? <LeagueChips value={league} onChange={setLeague} only={leagues} /> : null}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {months.map((month) => (
          <View key={month}>
            <GroupHeader title={month} />
            {shown
              .filter((f) => monthLabel(f.kickoffUtc) === month)
              .map((f) => (
                <FixtureRow key={f.id} fixture={f} showDate />
              ))}
          </View>
        ))}
        {shown.length === 0 ? (
          <Text className="mt-10 text-center text-[13px] text-muted">No fixtures are stored for this team yet.</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
