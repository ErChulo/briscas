/**
 * Shared timing constants for the online multiplayer flow.
 *
 * The controller (which owns the heartbeat effect and abandonment detection)
 * and the 4P GameBoard (which renders the "Desconectado…" badge) both import
 * these values so a change in one place automatically propagates to the other.
 */

/** How often the local client bumps its own `lastSeenAt` while in a game. */
export const HEARTBEAT_INTERVAL_MS = 12_000;

/**
 * How long another client waits — without seeing a fresh heartbeat — before
 * declaring a participant abandoned. The abandonee's team (4P) or the
 * abandonee (2P) becomes the loser and the rest of the room wins.
 */
export const ABANDONMENT_GRACE_MS = 45_000;

/**
 * How often the GameBoard re-renders the `is-stale` indicator so the
 * "Desconectado…" badge appears even if no game event fires during the grace
 * window. Should be much smaller than `ABANDONMENT_GRACE_MS`.
 */
export const STALE_TICK_INTERVAL_MS = 5_000;
