import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { useFixturesScope } from '@/api/hooks';
import { groupByDay } from '@/components/fixtures/day-groups';
import { FixtureRow } from '@/components/fixtures/fixture-row';
import { GroupHeader } from '@/components/fixtures/group-header';
import { LeagueChips } from '@/components/fixtures/league-chips';
import { ErrorNotice } from '@/components/ui/error-notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { LEAGUES } from '@/domain/mock';
import type { Fixture, LeagueId } from '@/domain/types';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { dayHeading } from '@/lib/dates';
import { useSession } from '@/state/session';

type Mode = 'fixtures' | 'results';

/** The list is flat for FlashList: a day heading is a row of its own, followed by that day's fixtures. */
type Row = { kind: 'header'; key: string; title: string } | { kind: 'fixture'; fixture: Fixture };

const isLeague = (v: unknown): v is LeagueId => LEAGUES.some((l) => l.id === v);

// Fixtures: everything still to come, soonest first. Results: everything played, newest first. One league or all.
// Home's "See All" opens this with its league already chosen.
export default function Fixtures() {
  const params = useLocalSearchParams<{ league?: string; mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'results' ? 'results' : 'fixtures');
  const [league, setLeague] = useState<LeagueId | 'all'>(isLeague(params.league) ? params.league : 'all');
  const { profile } = useSession();

  // Another "See All" tap arrives with new params while this tab is already mounted: follow it.
  const [seen, setSeen] = useState(`${params.league}|${params.mode}`);
  if (seen !== `${params.league}|${params.mode}`) {
    setSeen(`${params.league}|${params.mode}`);
    setLeague(isLeague(params.league) ? params.league : 'all');
    setMode(params.mode === 'results' ? 'results' : 'fixtures');
  }

  const list = useFixturesScope(mode === 'fixtures' ? 'upcoming' : 'results', league === 'all' ? undefined : league);
  const fixtures = list.data?.pages.flatMap((p) => p.fixtures) ?? [];
  const mine = (id: number) => profile.favoriteTeamIds.includes(id);
  const rows: Row[] = groupByDay(fixtures).flatMap((g) => [
    { kind: 'header' as const, key: g.key, title: dayHeading(g.kickoffUtc) },
    ...g.fixtures.map((f) => ({ kind: 'fixture' as const, fixture: f })),
  ]);
  const { refreshing, onRefresh } = useManualRefresh(list.refetch);

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-4">
        <Text className="text-[28px] font-extrabold text-white">Fixtures</Text>
      </View>

      <View className="mx-4 mb-2 mt-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'fixtures', label: 'Fixtures' },
            { value: 'results', label: 'Results' },
          ]}
        />
      </View>

      <LeagueChips value={league} onChange={setLeague} />

      <FlashList
        data={rows}
        keyExtractor={(r) => (r.kind === 'header' ? `h-${r.key}` : `f-${r.fixture.id}`)}
        getItemType={(r) => r.kind}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <GroupHeader title={item.title} />
          ) : (
            <FixtureRow
              fixture={item.fixture}
              showDate={mode === 'results'}
              highlight={mine(item.fixture.home.id) || mine(item.fixture.away.id)}
            />
          )
        }
        ListEmptyComponent={
          list.isError ? (
            <ErrorNotice message="Could not load matches. Check your connection." onRetry={() => void list.refetch()} />
          ) : (
            <Text className="mt-10 text-center text-[13px] text-muted">
              {list.isLoading ? 'Loading…' : mode === 'fixtures' ? 'No upcoming fixtures.' : 'No results yet.'}
            </Text>
          )
        }
        ListFooterComponent={
          <>
            {list.hasNextPage ? (
              <Pressable
                onPress={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                accessibilityRole="button"
                className="active:opacity-70 mt-5 h-11 items-center justify-center rounded-2xl border border-border bg-surface">
                <Text className="text-[13px] font-semibold text-white">{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</Text>
              </Pressable>
            ) : null}
            {mode === 'results' && fixtures.length > 0 ? (
              <Text className="mt-4 text-center text-[11px] text-muted">Final scores are saved each night.</Text>
            ) : null}
          </>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#19E3FF" />}
      />
    </Screen>
  );
}
