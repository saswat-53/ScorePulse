import { useSignIn, useSignUp } from '@clerk/expo';
import { Redirect, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/primary-button';
import { Icon } from '@/components/ui/icon';
import { Wordmark } from '@/components/ui/wordmark';
import { useSession } from '@/state/session';

type Step = 'choose' | 'email' | 'code';

/** True when Clerk says the address has no account. The code can sit on the error or on its first nested error. */
function isUnknownIdentifier(error: unknown): boolean {
  const e = error as { code?: string; message?: string; longMessage?: string; errors?: { code?: string }[] } | null;
  if (!e) return false;
  if (e.code === 'form_identifier_not_found' || e.errors?.some((x) => x.code === 'form_identifier_not_found')) return true;
  return /couldn'?t find your account/i.test(`${e.longMessage ?? ''} ${e.message ?? ''}`);
}

/** Email code sign-in. An unknown address falls through to sign-up, so one flow covers both. */
function useEmailCodeAuth() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setError((e as { message?: string } | null)?.message ?? 'Something went wrong. Try again.');
  };

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (!created.error) {
        const sent = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
        if (sent.error) return fail(sent.error);
        setMode('in');
        setStep('code');
        return;
      }
      // Unknown address: start a sign-up instead.
      if (!isUnknownIdentifier(created.error)) return fail(created.error);
      const up = await signUp.create({ emailAddress: email.trim() });
      if (up.error) return fail(up.error);
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return fail(sent.error);
      setMode('up');
      setStep('code');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') {
        const r = await signIn.emailCode.verifyCode({ code: code.trim() });
        if (r.error) return fail(r.error);
        const f = await signIn.finalize();
        if (f.error) return fail(f.error);
      } else {
        // A retry after the email was verified must not verify again ("already been verified").
        if (signUp.unverifiedFields.includes('email_address')) {
          const r = await signUp.verifications.verifyEmailCode({ code: code.trim() });
          if (r.error) return fail(r.error);
        }
        if (signUp.status !== 'complete') {
          // Clerk wants more than an email (dashboard requires e.g. a password or name). Say what.
          setError(`Sign-up needs more info (${signUp.missingFields.join(', ') || signUp.status}). Turn those off in Clerk.`);
          return;
        }
        const f = await signUp.finalize();
        if (f.error) return fail(f.error);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('choose');
    setCode('');
    setError(null);
  }

  return { step, setStep, email, setEmail, code, setCode, busy, error, sendCode, verify, reset };
}

export default function SignIn() {
  const { signedIn } = useSession();
  const auth = useEmailCodeAuth();
  if (signedIn) return <Redirect href={'/' as Href} />;
  return (
    <View className="flex-1 bg-bg px-6 pb-8 pt-24">
      <View className="items-center">
        <Wordmark size={42} />
        <Text className="mt-2.5 text-[11px] font-semibold tracking-[3px] text-neon">
          FOOTBALL. LIVE. ALWAYS ON.
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="h-[220px] w-[220px] items-center justify-center rounded-full border border-neon/30 bg-neon/5">
          <View className="h-[160px] w-[160px] items-center justify-center rounded-full border border-neon/50 bg-neon/10">
            <View className="h-[100px] w-[100px] items-center justify-center rounded-full border-2 border-neon/80 bg-neon/15">
              <Icon name="whistle" size={44} color="#19E3FF" />
            </View>
          </View>
        </View>
      </View>

      <Text className="text-[30px] font-extrabold italic leading-[33px] text-neon">YOUR{'\n'}FOOTBALL{'\n'}TERMINAL</Text>
      <Text className="mb-6 mt-3 text-[15px] leading-[22px] text-muted">
        Live scores. Real-time alerts.{'\n'}Personalised for you.
      </Text>

      {auth.step === 'choose' ? (
        <>
          <View className="h-[52px] items-center justify-center rounded-2xl bg-white/40">
            <Text className="text-[15px] font-bold text-bg">Google sign-in coming soon</Text>
          </View>
          <Pressable
            onPress={() => auth.setStep('email')}
            accessibilityRole="button"
            className="mt-3 h-[52px] items-center justify-center rounded-2xl border border-border bg-surface">
            <Text className="text-[15px] font-semibold text-white">Continue with Email</Text>
          </Pressable>
        </>
      ) : (
        <View className="gap-3">
          {auth.step === 'email' ? (
            <TextInput
              value={auth.email}
              onChangeText={auth.setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#8FA3C0"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              className="h-[52px] rounded-2xl border border-border bg-surface px-4 text-[15px] text-white"
            />
          ) : (
            <>
              <Text className="text-[13px] text-muted">We sent a code to {auth.email}</Text>
              <TextInput
                value={auth.code}
                onChangeText={auth.setCode}
                placeholder="6-digit code"
                placeholderTextColor="#8FA3C0"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                className="h-[52px] rounded-2xl border border-border bg-surface px-4 text-[15px] tracking-[4px] text-white"
              />
            </>
          )}
          {auth.error ? <Text className="text-[13px] text-red-400">{auth.error}</Text> : null}
          <PrimaryButton
            label={auth.busy ? 'Please wait…' : auth.step === 'email' ? 'Send code' : 'Verify'}
            disabled={auth.busy || (auth.step === 'email' ? !auth.email.includes('@') : auth.code.length < 6)}
            onPress={() => void (auth.step === 'email' ? auth.sendCode() : auth.verify())}
          />
          <Pressable onPress={auth.reset} accessibilityRole="button" className="items-center py-2">
            <Text className="text-[13px] font-semibold text-neon">Back</Text>
          </Pressable>
        </View>
      )}

      <Text className="mt-5 text-center text-[11px] leading-4 text-muted">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}
