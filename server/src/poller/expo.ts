import type { ExpoMessage, ExpoTicket, PushSender } from './send-alerts';

// Expo Push: one POST carries up to 100 messages and answers with one ticket per message. A `DeviceNotRegistered`
// ticket tells the sender to delete that token.
export function expoPush(): PushSender {
  return {
    async send(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) throw new Error(`Expo answered ${res.status}`);
      return ((await res.json()) as { data: ExpoTicket[] }).data;
    },
  };
}
