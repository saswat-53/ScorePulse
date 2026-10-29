import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useFixtures, useLive } from '@/api/hooks';
import { LeagueChips } from '@/components/fixtures/league-chips';
import { LiveCard } from '@/components/fixtures/live-card';
import { UpcomingList } from '@/components/fixtures/upcoming-list';
import { UpdateBanner } from '@/components/fixtures/update-banner';
import { RoundButton } from '@/components/ui/round-button';
import { Screen } from '@/components/ui/screen';
import { Wordmark } from '@/components/ui/wordmark';
import type { LeagueId } from '@/domain/types';
import { dateKey } from '@/lib/dates';
import { useSession } from '@/state/session';

export default function Home() {
  const [league, setLeague] = useState<LeagueId | 'all'>('all');
  const { profile } = useSession();
  const id = league === 'all' ? undefined : league;
  const live = useLive(id);
  const today = useFixtures(dateKey(new Date()), id);

  const upcoming = (today.data ?? []).filter((f) => f.status === 'scheduled');
  const mine = (f: { home: { id: number }; away: { id: number } }) =>
    profile.favoriteTeamIds.includes(f.home.id) || profile.favoriteTeamIds.includes(f.away.id);

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-4 pb-3">
        <Wordmark />
        <View className="flex-row gap-2">
          <RoundButton icon="search" label="Search" />
          <RoundButton icon="bell" label="Notifications" />
        </View>
      </View>

      <LeagueChips value={league} onChange={setLeague} />
      <UpdateBanner />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-base font-bold text-neon">Live Matches</Text>
          {live.data && live.data.length > 0 ? (
            <Text className="text-xs font-semibold text-soft">{live.data.length} live ›</Text>
          ) : null}
        </View>
        {live.data?.length ? (
          live.data.map((f) => <LiveCard key={f.id} fixture={f} highlight={mine(f)} />)
        ) : (
          <Text className="mt-3 text-[13px] text-muted">No live matches right now.</Text>
        )}

        <View className="mt-6 flex-row items-center justify-between">
          <Text className="text-base font-bold text-neon">Upcoming Fixtures</Text>
          <Pressable
            onPress={() => router.push('/fixtures' as Href)}
            accessibilityRole="link"
            className="h-11 justify-center">
            <Text className="text-xs font-semibold text-soft">See All</Text>
          </Pressable>
        </View>
        {upcoming.length ? (
          <UpcomingList fixtures={upcoming} />
        ) : (
          <Text className="mt-3 text-[13px] text-muted">No more fixtures today.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}
