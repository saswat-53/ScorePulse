// Per-user caps (ADR 0014), enforced on the server. The app also hides the control, but this is the lock.
export const MAX_FAVORITES = 3;
// A follow is active until its match is over; the same number is in migration 0012.
export const MAX_ACTIVE_FOLLOWS = 2;
