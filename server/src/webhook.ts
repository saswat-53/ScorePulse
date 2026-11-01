// Checks a Svix-signed webhook, which is how Clerk signs its events. The signature is HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{body}" with the secret's bytes (the part of `whsec_...` after the prefix), base64
// encoded, in a header that can list several `v1,<signature>` entries. A timestamp more than 5 minutes off is
// rejected, so a captured event cannot be replayed later.
const TOLERANCE_SECONDS = 5 * 60;

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

// Compares without stopping at the first difference.
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function verifySvix(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  body: string,
  now: Date,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > TOLERANCE_SECONDS) return false;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('raw', decode(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    return false;
  }
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    return version === 'v1' && value !== undefined && sameText(value, expected);
  });
}
