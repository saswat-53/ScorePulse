import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useMatch } from '@/api/hooks';
import { Lineups } from '@/components/match/lineups';
import { MatchHeader } from '@/components/match/match-header';
import { MatchTabs, type MatchTab } from '@/components/match/match-tabs';
import { LockedTimeline, NotLiveCard } from '@/components/match/not-live-card';
import { Overview } from '@/components/match/overview';
import { PausedBanner } from '@/components/match/paused-banner';
import { Stats } from '@/components/match/stats';
import { Timeline } from '@/components/match/timeline';
import { Screen } from '@/components/ui/screen';
import { useSession } from '@/state/session';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: match, isLoading } = useMatch(Number(id));
  const { followedIds, toggleFollow } = useSession();
  const [tab, setTab] = useState<MatchTab | null>(null);

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#19E3FF" />
        </View>
      </Screen>
    );
  }
  if (!match) {
    return (
      <Screen>
        <Text className="mt-24 text-center text-sm text-muted">This match could not be found.</Text>
      </Screen>
    );
  }

  const followed = followedIds.includes(match.id);
  // A fixture is live-tracked when the poller reads it: followed, or a favorite team plays.
  const liveTracked = match.tracking === 'live' || followed;
  const finished = match.status === 'finished';
  const active: MatchTab = tab ?? (liveTracked && !finished ? 'timeline' : 'overview');
  const showFollowCard = !liveTracked && !finished;

  return (
    <Screen bottom>
      <MatchHeader match={match} followed={followed} onToggleFollow={() => toggleFollow(match.id)} />
      {liveTracked && match.paused ? <PausedBanner updatedAt={match.updatedAt} /> : null}
      <MatchTabs value={active} onChange={setTab} />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {active === 'overview' && (
          <>
            {showFollowCard ? <NotLiveCard onFollow={() => toggleFollow(match.id)} /> : null}
            <Overview match={match} />
            {showFollowCard ? <LockedTimeline /> : null}
          </>
        )}
        {active === 'timeline' &&
          (showFollowCard ? (
            <>
              <NotLiveCard onFollow={() => toggleFollow(match.id)} />
              <LockedTimeline />
            </>
          ) : (
            <Timeline match={match} />
          ))}
        {active === 'lineups' && <Lineups match={match} />}
        {active === 'stats' && <Stats match={match} />}
      </ScrollView>
    </Screen>
  );
}
