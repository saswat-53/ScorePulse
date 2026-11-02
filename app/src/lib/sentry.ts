import * as Sentry from '@sentry/react-native';

// The DSN only says where to send reports, so it is safe to ship in the app. Without one (local work) Sentry stays off.
const rawDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
// A DSN is a full URL; anything else (a blank, a half-copied key) leaves Sentry off instead of breaking the app.
const dsn = rawDsn?.startsWith('https://') ? rawDsn : undefined;
const testing = process.env.EXPO_PUBLIC_SENTRY_TEST?.trim() === 'true';

Sentry.init({
  dsn,
  // Off in development so everyday errors stay out of Sentry; the test flag turns it on there too.
  enabled: Boolean(dsn) && (!__DEV__ || testing),
  // No IP address, device user or other personal data goes out with a report.
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

// With EXPO_PUBLIC_SENTRY_TEST=true, send one deliberate error at launch (#18). Remove the flag after checking.
if (testing && dsn) {
  Sentry.captureException(new Error('ScorePulse app test error (Sentry check)'));
}

export { Sentry };
