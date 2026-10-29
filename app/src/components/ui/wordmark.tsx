import { Text } from 'react-native';

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <Text className="font-extrabold italic text-white" style={{ fontSize: size, letterSpacing: -0.5 }}>
      Score<Text className="text-neon">Pulse</Text>
    </Text>
  );
}
