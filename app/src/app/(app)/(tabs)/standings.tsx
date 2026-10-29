import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useStandings } from '@/api/hooks';
import { LeagueChips } from '@/components/fixtures/league-chips';
import { Crest } from '@/components/ui/crest';
import { Screen } from '@/components/ui/screen';
import type { LeagueId } from '@/domain/types';
import { useSession } from '@/state/session';

const COLS = ['P', 'W', 'D', 'L'] as const;

export default function Standings() {
  const [league, setLeague] = useState<LeagueId>('PL');
  const { data } = useStandings(league);
  const { profile } = useSession();

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-4">
        <Text className="text-[28px] font-extrabold text-white">Standings</Text>
        {data ? <Text className="text-xs text-muted">{data.season}</Text> : null}
      </View>
      <View className="mt-3.5">
        <LeagueChips value={league} onChange={(v) => v !== 'all' && setLeague(v)} includeAll={false} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View className="mt-3.5 overflow-hidden rounded-2xl border border-neon/25 bg-surface">
          <View className="flex-row items-center border-b border-neon/10 py-2.5 pl-4 pr-3">
            <Text className="w-[22px] text-[11px] font-semibold text-muted">#</Text>
            <Text className="flex-1 text-[11px] font-semibold text-muted">Club</Text>
            {COLS.map((c) => (
              <Text key={c} className="w-6 text-center text-[11px] font-semibold text-muted">
                {c}
              </Text>
            ))}
            <Text className="w-[34px] text-center text-[11px] font-semibold text-muted">GD</Text>
            <Text className="w-[34px] text-right text-[11px] font-semibold text-white">Pts</Text>
          </View>

          {data?.rows.map((r) => {
            const mine = profile.favoriteTeamIds.includes(r.team.id);
            return (
              <View
                key={r.team.id}
                className={`h-[46px] flex-row items-center border-b border-neon/5 pl-4 pr-3 ${mine ? 'bg-neon/10' : ''}`}>
                <View
                  className={`absolute bottom-2 left-0 top-2 w-[3px] rounded-sm ${
                    r.zone === 'champions-league' ? 'bg-neon' : 'bg-transparent'
                  }`}
                />
                <Text className="w-[22px] text-[13px] font-semibold text-muted">{r.position}</Text>
                <View className="flex-1 flex-row items-center gap-2">
                  <Crest team={r.team} size={24} />
                  <Text numberOfLines={1} className={`flex-1 text-[13px] font-semibold ${mine ? 'text-neon' : 'text-white'}`}>
                    {r.team.shortName}
                  </Text>
                </View>
                <Text className="w-6 text-center text-[13px] text-soft">{r.played}</Text>
                <Text className="w-6 text-center text-[13px] text-soft">{r.won}</Text>
                <Text className="w-6 text-center text-[13px] text-soft">{r.drawn}</Text>
                <Text className="w-6 text-center text-[13px] text-soft">{r.lost}</Text>
                <Text className="w-[34px] text-center text-[13px] text-soft">
                  {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                </Text>
                <Text className="w-[34px] text-right text-[13px] font-extrabold text-white">{r.points}</Text>
              </View>
            );
          })}
        </View>

        <View className="mt-3 flex-row gap-4 px-1">
          <View className="flex-row items-center gap-1.5">
            <View className="h-[3px] w-2.5 rounded-sm bg-neon" />
            <Text className="text-[11px] text-muted">Champions League</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2.5 w-2.5 rounded-[3px] border border-neon/60 bg-neon/15" />
            <Text className="text-[11px] text-muted">Your team</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
