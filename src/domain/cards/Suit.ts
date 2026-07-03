/** Spanish-suited deck suits used by Briscas. */
export enum Suit {
  Oro = 'oro',
  Copa = 'copa',
  Espada = 'espada',
  Basto = 'basto',
}

export const SUITS: readonly Suit[] = [Suit.Oro, Suit.Copa, Suit.Espada, Suit.Basto];

export const SUIT_LABELS: Readonly<Record<Suit, string>> = {
  [Suit.Oro]: 'Oros',
  [Suit.Copa]: 'Copas',
  [Suit.Espada]: 'Espadas',
  [Suit.Basto]: 'Bastos',
};

export function isSuit(value: string): value is Suit {
  return SUITS.includes(value as Suit);
}
