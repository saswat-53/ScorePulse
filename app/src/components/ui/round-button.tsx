import { Pressable } from 'react-native';

import { Icon, type IconName } from './icon';

interface RoundButtonProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  active?: boolean;
}

/** 44px round icon button, the touch-target size used across the mockup. */
export function RoundButton({ icon, label, onPress, active }: RoundButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-11 w-11 items-center justify-center rounded-full border ${
        active ? 'border-neon bg-neon/15' : 'border-neon/30 bg-surface'
      }`}>
      <Icon name={icon} size={20} color={active ? '#19E3FF' : '#FFFFFF'} />
    </Pressable>
  );
}
