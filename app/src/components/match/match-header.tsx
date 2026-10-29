import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import { RoundButton } from '@/components/ui/round-button';
import { LEAGUES } from '@/domain/mock';
import type { MatchDetail } from '@/domain/types';
import { dayLabel, formatTime } from '@/lib/dates';

interface Props {
  match: MatchDetail;
  followed: boolean;
  onToggleFollow: () => void;
}

export function MatchHeader({ match, followed, onToggleFollow }: Props) {
  const league = LEAGUES.find((l) => l.id === match.leagueId);
  const live = match.status === 'live' || match.status === 'halftime';
  const started = live || match.status === 'finished';

  return (
    <View>
      <View className="flex-row items-center justify-between px-3">
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        <View className="items-center">
          <Text className="text-xs font-semibold text-white">
            {league?.name}
            {match.round ? ` · ${match.round}` : ''}
          </Text>
          {match.venue ? <Text className="mt-0.5 text-[11px] text-muted">{match.venue}</Text> : null}
        </View>
        {match.status === 'finished' ? (
          <View className="h-11 w-11" />
        ) : (
          <RoundButton
            icon={followed ? 'bell-fill' : 'bell'}
            label={followed ? 'Unfollow this match' : 'Follow this match'}
            active={followed}
            onPress={onToggleFollow}
          />
        )}
      </View>

      <View className="flex-row items-center justify-center gap-3 px-4 pt-4">
        <View className="w-[104px] items-center gap-1.5">
          <Crest team={match.home} size={60} />
          <Text className="text-[13px] font-bold text-white">{match.home.shortName}</Text>
        </View>
        <View className="items-center">
          {started ? (
            <>
              <Text className="text-[38px] font-extrabold italic text-white">
                {match.score.home} - {match.score.away}
              </Text>
              <Text
                className={`text-[13px] font-bold ${
                  live ? (match.paused ? 'text-warn' : 'text-live') : 'text-muted'
                }`}>
                {match.status === 'finished'
                  ? 'Full time'
                  : match.status === 'halftime'
                    ? 'Half time'
                    : `${match.minute}'${match.paused ? ' · last seen' : ''}`}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-[28px] font-extrabold text-white">{formatTime(match.kickoffUtc)}</Text>
              <Text className="text-xs font-semibold text-muted">{dayLabel(match.kickoffUtc)}</Text>
            </>
          )}
        </View>
        <View className="w-[104px] items-center gap-1.5">
          <Crest team={match.away} size={60} />
          <Text className="text-[13px] font-bold text-white">{match.away.shortName}</Text>
        </View>
      </View>
    </View>
  );
}
