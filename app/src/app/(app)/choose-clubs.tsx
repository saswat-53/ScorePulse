import { FlashList } from '@shopify/flash-list';
import { router, type Href } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useTeams } from '@/api/hooks';
import { Crest } from '@/components/ui/crest';
import { GLOW, GLOW_SOFT } from '@/components/ui/glow';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { MAX_FAVORITES, type Team } from '@/domain/types';
import { useSession } from '@/state/session';

interface ClubRowProps {
  team: Team;
  selected: boolean;
  onToggle: (team: Team) => void;
}

/** One club. Selected clubs get the glowing neon card from the mockup, with a remove button. */
const ClubRow = memo(function ClubRow({ team, selected, onToggle }: ClubRowProps) {
  return (
    <View
      className={`mt-2 h-[52px] flex-row items-center gap-3 rounded-2xl border pl-3 pr-1.5 ${
        selected ? 'border-2 border-neon bg-[#0A1E3C]' : 'border-border bg-surface'
      }`}
      style={selected ? GLOW : undefined}>
      <Crest team={team} size={selected ? 38 : 34} />
      <Text numberOfLines={1} className={`flex-1 text-[15px] text-white ${selected ? 'font-bold' : 'font-semibold'}`}>
        {team.name}
      </Text>
      <Pressable
        onPress={() => onToggle(team)}
        accessibilityRole="button"
        accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${team.name}`}
        className="h-11 w-11 items-center justify-center">
        <View
          className={`h-8 w-8 items-center justify-center rounded-full ${
            selected ? 'bg-white/10' : 'border border-neon/45'
          }`}>
          <Icon name={selected ? 'close' : 'plus'} size={16} color={selected ? '#FFFFFF' : '#19E3FF'} />
        </View>
      </Pressable>
    </View>
  );
});

function NotificationPrompt({ onDone }: { onDone: () => void }) {
  return (
    <View className="mt-5 rounded-2xl border-2 border-neon/80 bg-[#0A1E3C] p-4" style={GLOW}>
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full border border-neon/40 bg-neon/10">
          <Icon name="bell" size={22} color="#19E3FF" />
        </View>
        <Text className="flex-1 text-base font-bold text-white">Enable Notifications?</Text>
      </View>
      <Text className="mt-2 text-[13px] leading-[19px] text-soft">
        Get instant alerts for goals, match start, team news and more.
      </Text>
      <View className="mt-3.5 flex-row gap-2.5">
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          className="h-12 flex-1 items-center justify-center rounded-xl border border-border bg-surface-2">
          <Text className="text-sm font-semibold text-white">Not Now</Text>
        </Pressable>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          className="h-12 flex-1 items-center justify-center rounded-xl bg-neon"
          style={GLOW_SOFT}>
          <Text className="text-sm font-extrabold text-bg">Enable</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ChooseClubs() {
  const { favoriteTeams: chosen, toggleFavorite } = useSession();
  const [query, setQuery] = useState('');
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const { data: results = [] } = useTeams(query);

  const picked = chosen.map((t) => t.id);
  const available = results.filter((t) => !picked.includes(t.id));

  const onToggle = async (team: Team) => setLimitHit(!(await toggleFavorite(team)));

  const header = (
    <View>
      <Text className="mt-4 text-[26px] font-extrabold italic text-white">Choose Your Clubs</Text>
      <Text className="mt-2 text-sm leading-5 text-soft">
        Select up to {MAX_FAVORITES} clubs to get personalised news, fixtures and notifications.
      </Text>

      <View className="mt-4 h-12 flex-row items-center gap-2.5 rounded-2xl border border-neon/30 bg-surface px-3.5">
        <Icon name="search" size={18} color="#8FA3C0" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search clubs..."
          placeholderTextColor="#8FA3C0"
          accessibilityLabel="Search clubs"
          className="flex-1 text-sm text-white"
        />
      </View>

      <Text className="mt-5 text-xs font-bold tracking-widest text-neon">
        YOUR CLUBS ({picked.length}/{MAX_FAVORITES})
      </Text>
      {chosen.length === 0 ? (
        <Text className="mt-2 text-[13px] text-muted">Pick at least one club to continue.</Text>
      ) : (
        chosen.map((t) => <ClubRow key={t.id} team={t} selected onToggle={onToggle} />)
      )}
      {limitHit ? (
        <Text className="mt-2 text-xs text-warn">You can pick up to {MAX_FAVORITES} clubs. Remove one first.</Text>
      ) : null}

      <Text className="mt-5 text-xs font-bold tracking-widest text-soft">
        {query ? 'RESULTS' : 'POPULAR CLUBS'}
      </Text>
    </View>
  );

  return (
    <Screen bottom>
      <FlashList
        data={available.slice(0, query ? 20 : 8)}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <ClubRow team={item} selected={false} onToggle={onToggle} />}
        ListHeaderComponent={header}
        ListFooterComponent={
          picked.length > 0 && !promptDismissed ? (
            <NotificationPrompt onDone={() => setPromptDismissed(true)} />
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      />

      <View className="px-4 pb-2 pt-2">
        <PrimaryButton
          label="Continue"
          disabled={picked.length === 0}
          onPress={() => router.replace('/' as Href)}
        />
      </View>
    </Screen>
  );
}
