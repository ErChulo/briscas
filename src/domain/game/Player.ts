import { Hand } from '../cards/Hand';
import type { PlayerId, TeamId } from './Types';

/** Participant in a Briscas room. */
export class Player {
  public constructor(
    public readonly id: PlayerId,
    public readonly displayName: string,
    public readonly seatIndex: number,
    public readonly hand: Hand = new Hand(),
    public readonly score = 0,
    public readonly capturedTricks = 0,
    public readonly teamId: TeamId | null = null,
    public readonly connected = true,
  ) {}

  public withHand(hand: Hand): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      hand,
      this.score,
      this.capturedTricks,
      this.teamId,
      this.connected,
    );
  }

  public withScore(score: number): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      this.hand,
      score,
      this.capturedTricks,
      this.teamId,
      this.connected,
    );
  }

  public withCapturedTrick(): Player {
    return new Player(
      this.id,
      this.displayName,
      this.seatIndex,
      this.hand,
      this.score,
      this.capturedTricks + 1,
      this.teamId,
      this.connected,
    );
  }
}
