import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import type { MatchDetail } from '@/domain/types';
import { formatTime } from '@/lib/dates';

// The poller runs on the UTC 5-minute beat (ADR 0016), so the next poll is the next multiple of 5 minutes.
const POLL_MS = 5 * 60_000;
// A poll takes a few seconds to land, so the screen asks again a little after the beat.
const SETTLE_MS = 20_000;

const nextPollAt = (now: number) => Math.ceil((now + 1) / POLL_MS) * POLL_MS;

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * What a followed match shows before its first poll has stored anything: the timeline, lineups and stats are empty
 * because no poll has run yet, not because nothing happened. Says what is being waited for and for how long.
 */
export function WaitingCard({ match }: { match: MatchDetail }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = nextPollAt(now);
  const left = next - now;
  const kickoff = new Date(match.kickoffUtc).getTime();
  const notStarted = match.status === 'scheduled' && kickoff > now;
  const halftime = match.status === 'halftime';
  const countdown = !notStarted && !halftime && !match.paused && !match.limited;

  // Ask for fresh data just after each beat instead of waiting for the once-a-minute refresh.
  const beat = next;
  useEffect(() => {
    if (!countdown) return;
    const t = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['match', match.id] }), beat - Date.now() + SETTLE_MS);
    return () => clearTimeout(t);
  }, [countdown, beat, match.id, queryClient]);

  let title = 'Waiting for the first update';
  let body = 'You are following this match. Live data arrives with the next check, and the timeline then fills in from kickoff.';
  if (notStarted) {
    title = `Kicks off at ${formatTime(match.kickoffUtc)}`;
    body = 'Live updates and alerts start at kickoff.';
  } else if (halftime) {
    title = 'Half time';
    body = 'Updates resume in the second half.';
  } else if (match.limited) {
    title = 'Scores only today';
    body = "Today's live-data limit is used up, so the timeline and lineups are not available. Scores still update.";
  } else if (match.paused) {
    title = 'Updates are slower right now';
    body = 'Live data is refreshing about every 10 minutes. The timeline fills in from kickoff when the next one lands.';
  }

  return (
    <View className="mx-4 mt-4 rounded-2xl border border-neon/55 bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-neon/10">
          <Icon name="bell-fill" size={20} color="#19E3FF" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-white">{title}</Text>
          <Text className="mt-0.5 text-xs text-soft">Following</Text>
        </View>
        {countdown ? (
          <View className="items-end">
            <Text className="text-[22px] font-extrabold text-neon">{left < 1000 ? '0:00' : clock(left)}</Text>
            <Text className="text-[10px] uppercase text-muted">next check</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-3 text-[13px] leading-5 text-soft">{body}</Text>
      {countdown ? (
        <Text className="mt-2 text-xs leading-[17px] text-muted">
          Checks run every 5 minutes, so the countdown is approximate. Alerts for goals, cards and full time arrive as push
          notifications.
        </Text>
      ) : null}
    </View>
  );
}
