import { Card } from '../cards/Card';
import type { PlayerId } from './Types';

export interface PlayedCard {
  readonly playerId: PlayerId;
  readonly card: Card;
}

/** Cards played during the current trick. */
export class Trick {
  public constructor(
    public readonly leadPlayerId: PlayerId | null,
    public readonly plays: readonly PlayedCard[] = [],
  ) {}

  public get leadSuit() {
    return this.plays[0]?.card.suit ?? null;
  }

  public get isEmpty(): boolean {
    return this.plays.length === 0;
  }

  public isComplete(playerCount: number): boolean {
    return this.plays.length === playerCount;
  }

  public hasPlayed(playerId: PlayerId): boolean {
    return this.plays.some((play) => play.playerId === playerId);
  }

  public addPlay(playerId: PlayerId, card: Card): Trick {
    const leadPlayerId = this.leadPlayerId ?? playerId;
    return new Trick(leadPlayerId, [...this.plays, { playerId, card }]);
  }
}
