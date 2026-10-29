import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useFixtures } from '@/api/hooks';
import { DayStrip } from '@/components/fixtures/day-strip';
import { FixtureRow } from '@/components/fixtures/fixture-row';
import { GroupHeader } from '@/components/fixtures/group-header';
import { RoundButton } from '@/components/ui/round-button';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { LEAGUES } from '@/domain/mock';
import { dateKey, dayChips } from '@/lib/dates';
import { useSession } from '@/state/session';

type Mode = 'fixtures' | 'results';

// Fixtures cover the next 14 days, results the past week (ScoreplusPlan scope).
const FIXTURE_DAYS = dayChips(0, 13);
const RESULT_DAYS = dayChips(-7, -1);

export default function Fixtures() {
  const [mode, setMode] = useState<Mode>('results');
  const [fixtureDay, setFixtureDay] = useState(dateKey(new Date()));
  const [resultDay, setResultDay] = useState(RESULT_DAYS[RESULT_DAYS.length - 1].key);
  const { profile } = useSession();

  const day = mode === 'fixtures' ? fixtureDay : resultDay;
  const { data = [], isLoading } = useFixtures(day);
  const mine = (id: number) => profile.favoriteTeamIds.includes(id);

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-4">
        <Text className="text-[28px] font-extrabold text-white">Fixtures</Text>
        <RoundButton icon="search" label="Search" />
      </View>

      <View className="mx-4 mb-3.5 mt-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'fixtures', label: 'Fixtures' },
            { value: 'results', label: 'Results' },
          ]}
        />
      </View>

      <DayStrip
        days={mode === 'fixtures' ? FIXTURE_DAYS : RESULT_DAYS}
        value={day}
        onChange={mode === 'fixtures' ? setFixtureDay : setResultDay}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {LEAGUES.map((l) => {
          const rows = data.filter((f) => f.leagueId === l.id);
          if (rows.length === 0) return null;
          return (
            <View key={l.id}>
              <GroupHeader title={l.name} />
              {rows.map((f) => (
                <FixtureRow key={f.id} fixture={f} highlight={mine(f.home.id) || mine(f.away.id)} />
              ))}
            </View>
          );
        })}
        {!isLoading && data.length === 0 ? (
          <Text className="mt-10 text-center text-[13px] text-muted">
            {mode === 'fixtures' ? 'No fixtures on this day.' : 'No results on this day.'}
          </Text>
        ) : null}
        {mode === 'results' && data.length > 0 ? (
          <Text className="mt-4 text-center text-[11px] text-muted">Final scores are saved each night.</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
