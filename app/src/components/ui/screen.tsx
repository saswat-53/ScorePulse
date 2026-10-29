import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Page background and top safe-area padding. Bottom is left to the tab bar or the screen. */
export function Screen({ children, bottom = false }: { children: ReactNode; bottom?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-bg"
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: bottom ? insets.bottom : 0,
        experimental_backgroundImage: 'linear-gradient(to bottom, #0A1D42 0%, #050B18 42%)',
      }}>
      {children}
    </View>
  );
}
