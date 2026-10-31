/** The server does not send a team colour, so the ring gets one from a fixed palette, the same for a team every time. */
const PALETTE = ['#E63946', '#19E3FF', '#F4A261', '#2A9D8F', '#9B5DE5', '#F15BB5', '#00BBF9', '#80ED99'];

export const teamColor = (teamId: number): string => PALETTE[teamId % PALETTE.length];
