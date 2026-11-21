import { Pressable, Text, View } from 'react-native';

interface Props {
  message: string;
  /** Shows a "Try again" button that runs this. */
  onRetry?: () => void;
  className?: string;
}

/**
 * A failed load. Without it a screen whose request failed shows the same words as an empty answer ("No upcoming
 * fixtures."), which tells the user there is nothing when the truth is that the app could not reach the server.
 * Announced to screen readers as an alert.
 */
export function ErrorNotice({ message, onRetry, className = 'mt-10' }: Props) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" className={`items-center ${className}`}>
      <Text className="text-center text-[13px] text-muted">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="mt-3 h-11 items-center justify-center rounded-2xl border border-border bg-surface px-5 active:opacity-70">
          <Text className="text-[13px] font-semibold text-white">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
