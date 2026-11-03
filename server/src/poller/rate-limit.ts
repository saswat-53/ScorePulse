// API-Football refuses a request over its per-minute limit with a 200 and `errors.rateLimit` in the body. The match was
// not asked about, so the refusal is neither an empty answer nor a try: callers stop for this run and ask again on the
// next beat.
export class RateLimited extends Error {
  constructor(path: string) {
    super(`API-Football rate limit on ${path}`);
  }
}
