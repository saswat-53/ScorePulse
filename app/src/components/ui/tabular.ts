/**
 * Equal-width digits for numbers that change or line up: scores, minutes, the countdown, standings columns. Without
 * it a score going from 1-0 to 1-1 can nudge the text beside it. A style, not the `tabular-nums` class: NativeWind
 * does not support `font-variant-numeric`.
 */
export const TABULAR = { fontVariant: ['tabular-nums'] } as const;
