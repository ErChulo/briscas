import { Hand } from '../cards/Hand';
import type { PlayerId, TeamId } from './Types';

/** Participant in a Briscas room. */
export class Player {
  public constructor(
    public readonly id: PlayerId,
    public readonly displayName: string,
    public readonly seatIndex: number,
    public readonly hand: Hand = new Hand(),
    public readonly capturedTricks = 0,
    public readonly teamId: TeamId | null = null,
    public readonly connected = true,
    public readonly lastSeenAt: number = 0,
    public readonly abandonedAt: number | null = null,
  ) {}

  public withHand(hand: Hand): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      hand,
      this.capturedTricks,
      this.teamId,
      this.connected,
      this.lastSeenAt,
      this.abandonedAt,
    );
  }

  public withCapturedTrick(): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      this.hand,
      this.capturedTricks + 1,
      this.teamId,
      this.connected,
      this.lastSeenAt,
      this.abandonedAt,
    );
  }

  public withLastSeen(timestampMs: number): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      this.hand,
      this.capturedTricks,
      this.teamId,
      this.connected,
      timestampMs,
      this.abandonedAt,
    );
  }

  public withAbandoned(timestampMs: number): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      this.hand,
      this.capturedTricks,
      this.teamId,
      this.connected,
      this.lastSeenAt,
      timestampMs,
    );
  }

  /** True when the player's last server heartbeat is older than the grace window. */
  public isStale(nowMs: number, thresholdMs: number): boolean {
    if (this.abandonedAt !== null) {
      return false;
    }
    if (this.lastSeenAt === 0) {
      // Brand-new player who has not posted a heartbeat yet — never stale.
      return false;
    }
    return nowMs - this.lastSeenAt > thresholdMs;
  }
}
