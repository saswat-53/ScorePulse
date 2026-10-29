import { Redirect, Tabs, type Href } from 'expo-router';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { useSession } from '@/state/session';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: unknown }) => <Icon name={icon} size={22} color={String(color)} />,
});

export default function TabsLayout() {
  const { profile } = useSession();
  // Lift the bar above the system navigation bar when there is one. With none, the inset is 0.
  const bottom = Math.max(useSafeAreaInsets().bottom, 8);
  // Onboarding: at least one favorite team before the app opens.
  if (profile.favoriteTeamIds.length === 0) return <Redirect href={'/choose-clubs' as Href} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#19E3FF',
        tabBarInactiveTintColor: '#8FA3C0',
        tabBarStyle: { backgroundColor: '#071027', borderTopColor: 'rgba(25,227,255,0.18)', height: 60 + bottom, paddingTop: 6, paddingBottom: bottom },
        tabBarLabelStyle: { fontSize: 11 },
        sceneStyle: { backgroundColor: '#050B18' },
      }}>
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="fixtures" options={tab('Fixtures', 'calendar')} />
      <Tabs.Screen name="standings" options={tab('Standings', 'bars')} />
      <Tabs.Screen name="more" options={tab('More', 'more')} />
    </Tabs>
  );
}
