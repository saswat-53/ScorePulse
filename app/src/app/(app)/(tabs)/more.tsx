import { router, type Href } from 'expo-router';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import type { AlertSettings } from '@/domain/types';
import { useSession } from '@/state/session';

// Only the events v1 can send (docs/deferred.md lists what was cut).
const ALERTS: { key: keyof AlertSettings; icon: IconName; title: string; subtitle: string }[] = [
  { key: 'goals', icon: 'flag', title: 'Goals', subtitle: 'Notify me when my teams score' },
  { key: 'cards', icon: 'cards', title: 'Cards', subtitle: 'Yellow and red cards' },
  { key: 'substitutions', icon: 'sliders', title: 'Substitutions', subtitle: 'When players are swapped' },
  { key: 'kickoff', icon: 'whistle', title: 'Match Start', subtitle: 'Notify before kickoff' },
  { key: 'fullTime', icon: 'calendar', title: 'Full Time', subtitle: 'Get notified when the match ends' },
];

export default function More() {
  const { profile, favoriteTeams: favorites, setAlert, signOut } = useSession();

  const confirmDelete = () =>
    Alert.alert(
      'Delete account?',
      'This removes your teams, follows and devices. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: signOut },
      ],
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <View className="mt-2 flex-row items-center gap-4">
          <View className="h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-neon/60 bg-surface-2">
            <Text className="text-[28px] font-extrabold text-neon">{profile.name.charAt(0)}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-white">{profile.name}</Text>
            <Text className="mt-0.5 text-[13px] text-muted">{profile.email}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/choose-clubs' as Href)}
          accessibilityRole="button"
          className="mt-5 flex-row items-center gap-3 rounded-2xl border border-neon/25 bg-surface px-4 py-3.5">
          <Icon name="user" size={20} color="#19E3FF" />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-white">Favorite teams</Text>
            <View className="mt-1.5 flex-row gap-1.5">
              {favorites.map((t) => (
                <Crest key={t.id} team={t} size={24} />
              ))}
            </View>
          </View>
          <Icon name="chevron-right" size={18} color="#8FA3C0" />
        </Pressable>

        <Text className="mb-2 mt-6 text-base font-bold text-neon">Notification Alerts</Text>
        <View className="rounded-2xl border border-neon/20 bg-surface px-3.5">
          {ALERTS.map((a, i) => (
            <View
              key={a.key}
              className={`flex-row items-center gap-3 py-3 ${i < ALERTS.length - 1 ? 'border-b border-neon/10' : ''}`}>
              <Icon name={a.icon} size={20} color="#FFFFFF" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white">{a.title}</Text>
                <Text className="text-[11px] text-muted">{a.subtitle}</Text>
              </View>
              <Switch
                value={profile.alerts[a.key]}
                onValueChange={(v) => setAlert(a.key, v)}
                trackColor={{ false: '#1B2D4D', true: '#19E3FF' }}
                thumbColor="#FFFFFF"
                accessibilityLabel={a.title}
              />
            </View>
          ))}
        </View>

        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          className="mt-6 h-[52px] items-center justify-center rounded-2xl border border-border bg-surface">
          <Text className="text-[15px] font-semibold text-white">Sign out</Text>
        </Pressable>
        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          className="mt-3 h-[52px] flex-row items-center justify-center gap-2 rounded-2xl border border-danger/60 bg-danger/10">
          <Icon name="trash" size={18} color="#FF3B47" />
          <Text className="text-[15px] font-semibold text-danger">Delete Account</Text>
        </Pressable>

        {__DEV__ ? (
          <Pressable
            onPress={() => router.push('/update-required' as Href)}
            accessibilityRole="button"
            className="mt-6 items-center py-3">
            <Text className="text-xs text-muted">Developer: preview the update-required screen</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
