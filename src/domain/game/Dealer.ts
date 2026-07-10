import { Deck, type DeckFactory, SpanishDeckFactory } from '../cards/Deck';
import { Hand } from '../cards/Hand';
import { Player } from './Player';

export interface DealResult {
  readonly players: readonly Player[];
  readonly deck: Deck;
}

/** Handles deck creation and initial dealing without owning turn logic. */
export class Dealer {
  public constructor(private readonly deckFactory: DeckFactory = new SpanishDeckFactory()) {}

  public dealInitialHands(players: readonly Player[], seed: number, handSize = 3): DealResult {
    let deck = this.deckFactory.create(seed);
    let dealtPlayers = players.map(
      (player) => new Player(player.id, player.displayName, player.seatIndex, new Hand(), 0, player.teamId),
    );

    for (let cardIndex = 0; cardIndex < handSize; cardIndex += 1) {
      dealtPlayers = dealtPlayers.map((player) => {
        const draw = deck.draw();
        deck = draw.deck;
        return draw.card ? player.withHand(player.hand.add(draw.card)) : player;
      });
    }

    const trumpDraw = deck.draw();
    if (!trumpDraw.card) {
      throw new Error('Cannot reveal trump card from an empty deck.');
    }

    const stockWithTrumpAtBottom = new Deck([...trumpDraw.deck.toArray(), trumpDraw.card], trumpDraw.card);

    return {
      players: dealtPlayers,
      deck: stockWithTrumpAtBottom,
    };
  }
}
