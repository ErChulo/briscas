import { type Rank, RANK_LABELS, isRank } from './Rank';
import { Suit, SUIT_LABELS, isSuit } from './Suit';

export type CardId = `${Suit}-${Rank}`;

const POINT_VALUES: Readonly<Record<Rank, number>> = {
  1: 11,
  2: 0,
  3: 10,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  10: 2,
  11: 3,
  12: 4,
};

const CAPTURE_STRENGTH: Readonly<Record<Rank, number>> = {
  1: 1,
  3: 2,
  12: 3,
  11: 4,
  10: 5,
  7: 6,
  6: 7,
  5: 8,
  4: 9,
  2: 10,
};

/**
 * Immutable value object representing a Spanish-suited playing card.
 */
export class Card {
  public constructor(
    public readonly suit: Suit,
    public readonly rank: Rank,
  ) {}

  public get id(): CardId {
    return `${this.suit}-${this.rank}`;
  }

  public get pointValue(): number {
    return POINT_VALUES[this.rank];
  }

  /** Lower values are stronger, matching the specification's capture order. */
  public get captureStrength(): number {
    return CAPTURE_STRENGTH[this.rank];
  }

  public isTrump(trumpSuit: Suit): boolean {
    return this.suit === trumpSuit;
  }

  public equals(other: Card): boolean {
    return this.suit === other.suit && this.rank === other.rank;
  }

  public toString(): string {
    return `${RANK_LABELS[this.rank]} de ${SUIT_LABELS[this.suit]}`;
  }

  public static fromId(id: string): Card {
    const [suit, rankText] = id.split('-');
    const rank = Number(rankText);

    if (!isSuit(suit) || !isRank(rank)) {
      throw new Error(`Invalid card id: ${id}`);
    }

    return new Card(suit, rank);
  }
}
