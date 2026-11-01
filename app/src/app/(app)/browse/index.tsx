import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useBrowse } from '@/api/hooks';
import { Icon } from '@/components/ui/icon';
import { RoundButton } from '@/components/ui/round-button';
import { Screen } from '@/components/ui/screen';
import type { BrowseLeague } from '@/domain/types';

function LeagueRow({ league, pick }: { league: BrowseLeague; pick: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(`/browse/${league.id}${pick ? '?pick=1' : ''}` as Href)}
      accessibilityRole="button"
      className="mt-2 h-[52px] flex-row items-center rounded-2xl border border-neon/25 bg-surface px-4">
      <Text className="flex-1 text-[15px] font-semibold text-white">{league.name}</Text>
      <Icon name="chevron-right" size={18} color="#8FA3C0" />
    </Pressable>
  );
}

const Section = ({ title }: { title: string }) => (
  <Text className="mt-6 text-xs font-bold tracking-widest text-neon">{title.toUpperCase()}</Text>
);

/** World, then country, then league: the way in to every club. `pick`: opened from the club picker, so a club is chosen, not opened. */
export default function Browse() {
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const { data, isLoading } = useBrowse();

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-3">
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        <Text className="text-xl font-extrabold text-white">Browse clubs</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#19E3FF" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {data?.world.length ? <Section title="World" /> : null}
          {data?.world.map((l) => <LeagueRow key={l.id} league={l} pick={!!pick} />)}
          {data?.countries.map((c) => (
            <View key={c.name}>
              <Section title={c.name} />
              {c.leagues.map((l) => <LeagueRow key={l.id} league={l} pick={!!pick} />)}
            </View>
          ))}
          {!data ? <Text className="mt-10 text-center text-[13px] text-muted">Could not load the list. Try again.</Text> : null}
        </ScrollView>
      )}
    </Screen>
  );
}
