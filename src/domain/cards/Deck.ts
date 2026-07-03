import { Card } from './Card';
import { RANKS } from './Rank';
import { SUITS, type Suit } from './Suit';

/** A deterministic pseudo-random number generator for reproducible shuffles. */
export class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

/** Immutable draw pile. The trump card remains at the bottom of the pile. */
export class Deck {
  public constructor(
    private readonly cards: readonly Card[],
    public readonly trumpCard: Card | null = null,
  ) {}

  public get count(): number {
    return this.cards.length;
  }

  public get isEmpty(): boolean {
    return this.cards.length === 0;
  }

  public get trumpSuit(): Suit | null {
    return this.trumpCard?.suit ?? null;
  }

  public toArray(): readonly Card[] {
    return [...this.cards];
  }

  public draw(): { deck: Deck; card: Card | null } {
    const [card, ...remaining] = this.cards;
    return {
      card: card ?? null,
      deck: new Deck(remaining, remaining.length === 0 ? null : this.trumpCard),
    };
  }

  public replaceTrumpCard(newTrumpCard: Card): Deck {
    if (!this.trumpCard || this.cards.length === 0) {
      return this;
    }

    const cards = [...this.cards];
    const index = cards.findIndex((card) => card.equals(this.trumpCard as Card));
    const replacementIndex = index === -1 ? cards.length - 1 : index;
    cards[replacementIndex] = newTrumpCard;
    return new Deck(cards, newTrumpCard);
  }

  public static spanishDeck(): Deck {
    return new Deck(SUITS.flatMap((suit) => RANKS.map((rank) => new Card(suit, rank))));
  }

  public shuffled(seed: number): Deck {
    const random = new SeededRandom(seed);
    const cards = [...this.cards];

    for (let index = cards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random.next() * (index + 1));
      [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
    }

    return new Deck(cards, this.trumpCard);
  }
}

/** Factory abstraction for Open/Closed deck construction. */
export interface DeckFactory {
  create(seed: number): Deck;
}

/** Default 40-card Spanish deck factory. */
export class SpanishDeckFactory implements DeckFactory {
  public create(seed: number): Deck {
    return Deck.spanishDeck().shuffled(seed);
  }
}
