import { useQueryClient } from '@tanstack/react-query';
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
import { MAX_ACTIVE_FOLLOWS } from '@/domain/types';
import { useSession } from '@/state/session';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: match, isLoading } = useMatch(Number(id));
  const { followedIds, canFollowMore, toggleFollow } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MatchTab | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

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
  const followDisabled = !followed && !canFollowMore;
  const onToggleFollow = async () => {
    setFollowError(null);
    const result = await toggleFollow(match.id);
    if (result === 'full') setFollowError(`You can follow ${MAX_ACTIVE_FOLLOWS} matches at once. Unfollow one first.`);
    else if (result === 'over') setFollowError('This match is over, so it cannot be followed.');
    else if (result === 'error') setFollowError('Could not reach the server. Try again.');
    // Following makes the match live-tracked, so its timeline and the Follow card change.
    void queryClient.invalidateQueries({ queryKey: ['match', match.id] });
  };
  // A fixture is live-tracked when the poller reads it: followed, or a favorite team plays.
  const liveTracked = match.tracking === 'live' || followed;
  const finished = match.status === 'finished';
  const active: MatchTab = tab ?? (liveTracked && !finished ? 'timeline' : 'overview');
  const showFollowCard = !liveTracked && !finished;

  return (
    <Screen bottom>
      <MatchHeader match={match} followed={followed} followDisabled={followDisabled} onToggleFollow={onToggleFollow} />
      {followDisabled || followError ? (
        <Text className="mx-4 mt-2 text-center text-xs text-warn">
          {followError ?? `You can follow ${MAX_ACTIVE_FOLLOWS} matches at once. Unfollow one first.`}
        </Text>
      ) : null}
      {liveTracked && match.paused ? <PausedBanner updatedAt={match.updatedAt} /> : null}
      <MatchTabs value={active} onChange={setTab} />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {active === 'overview' && (
          <>
            {showFollowCard ? <NotLiveCard onFollow={onToggleFollow} disabled={followDisabled} /> : null}
            <Overview match={match} />
            {showFollowCard ? <LockedTimeline /> : null}
          </>
        )}
        {active === 'timeline' &&
          (showFollowCard ? (
            <>
              <NotLiveCard onFollow={onToggleFollow} disabled={followDisabled} />
              <LockedTimeline />
            </>
          ) : (
            <Timeline match={match} />
          ))}
        {/* Lineups and stats are only fetched for live-tracked matches, so any other match offers Follow instead. */}
        {(active === 'lineups' || active === 'stats') &&
          (showFollowCard ? (
            <NotLiveCard onFollow={onToggleFollow} disabled={followDisabled} />
          ) : active === 'lineups' ? (
            <Lineups match={match} />
          ) : (
            <Stats match={match} />
          ))}
      </ScrollView>
    </Screen>
  );
}
