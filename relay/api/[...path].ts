// Forwards the Worker's API-Football requests from an address that is not Cloudflare's. From the Worker's shared address
// API-Football often refuses a request for rate limit whatever the plan has left (#26); from elsewhere it does not.
// The Worker sends the same path under `/api` and its own `x-apisports-key`; nothing is stored here, and the key is not a
// setting of the relay. Only the three paths the Worker uses are forwarded, and only GET.

const UPSTREAM = 'https://v3.football.api-sports.io';
const ALLOWED = new Set(['/fixtures', '/fixtures/lineups', '/fixtures/statistics']);

export async function handle(req: Request, upstream: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api(?=\/)/, '');
  if (req.method !== 'GET' || !ALLOWED.has(path)) return new Response('not found', { status: 404, headers: { 'x-relay': '1' } });
  const key = req.headers.get('x-apisports-key');
  if (!key) return new Response('missing key', { status: 401, headers: { 'x-relay': '1' } });
  // Vercel's catch-all route adds the matched path to the query as `...path` (the catch-all's own name), which API-Football rejects as an unknown field.
  url.searchParams.delete('...path');
  const res = await upstream(`${UPSTREAM}${path}${url.search}`, { headers: { 'x-apisports-key': key } });
  // The status, the body and the rate-limit headers come back as they were, so the Worker logs what API-Football said.
  // `x-relay` tells the Worker the answer is API-Football's, not the hosting platform's own error page.
  const headers = new Headers({ 'content-type': res.headers.get('content-type') ?? 'application/json', 'x-relay': '1' });
  for (const [name, value] of res.headers) if (name.startsWith('x-ratelimit')) headers.set(name, value);
  return new Response(res.body, { status: res.status, headers });
}

// Vercel calls the function named for the method, with the request as it came: `/api/fixtures?live=78-78`.
export function GET(request: Request): Promise<Response> {
  return handle(request);
}
