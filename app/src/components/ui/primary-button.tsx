import { Pressable, Text } from 'react-native';

import { Icon, type IconName } from './icon';

interface Props {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, icon, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`active:opacity-70 h-[52px] flex-row items-center justify-center gap-2 rounded-2xl ${
        disabled ? 'bg-surface-2' : 'bg-neon'
      }`}>
      {icon ? <Icon name={icon} size={18} color={disabled ? '#8FA3C0' : '#050B18'} /> : null}
      <Text className={`text-base font-extrabold ${disabled ? 'text-muted' : 'text-bg'}`}>{label}</Text>
    </Pressable>
  );
}
