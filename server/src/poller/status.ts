// API-Football status codes of a match being played. Halftime (HT) is left out on purpose: no polling then (ADR 0016).
export const IN_PLAY = ['1H', '2H', 'ET', 'BT', 'P', 'LIVE'];
export const NOT_STARTED = 'NS';
export const HALFTIME = 'HT';
export const FULL_TIME = 'FT';

// A match not started this long after kickoff is postponed or delayed, so it is not polled.
export const MAX_LATE_START_MINUTES = 30;
// Halftime lasts 15 minutes; polling resumes once it has likely ended.
export const HALFTIME_MINUTES = 14;
// `live=` stops listing a match at full time. Absent after this long, it is over (a 90-minute match with halftime ends by about 105).
export const PRESUMED_OVER_MINUTES = 100;
// A fixture whose kickoff is older than this is over, whatever its stored status says.
export const MAX_MATCH_HOURS = 4;
