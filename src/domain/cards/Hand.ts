import { Card, type CardId } from './Card';

/** Immutable player hand. */
export class Hand {
  public constructor(private readonly cards: readonly Card[] = []) {}

  public get size(): number {
    return this.cards.length;
  }

  public toArray(): readonly Card[] {
    return [...this.cards];
  }

  public has(card: Card): boolean {
    return this.cards.some((candidate) => candidate.equals(card));
  }

  public hasId(cardId: CardId): boolean {
    return this.cards.some((candidate) => candidate.id === cardId);
  }

  public add(card: Card): Hand {
    return new Hand([...this.cards, card]);
  }

  public remove(card: Card): Hand {
    let removed = false;
    const remaining = this.cards.filter((candidate) => {
      if (!removed && candidate.equals(card)) {
        removed = true;
        return false;
      }

      return true;
    });

    return new Hand(remaining);
  }
}
