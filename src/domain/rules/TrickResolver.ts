import type { Suit } from '../cards/Suit';
import type { Trick, PlayedCard } from '../game/Trick';
import type { PlayerId } from '../game/Types';

/** Strategy interface for resolving the winner of a completed trick. */
export interface TrickResolver {
  resolveWinner(trick: Trick, trumpSuit: Suit): PlayerId;
}

/** Default no-follow-suit Briscas trick resolver from the DOCX. */
export class StandardTrickResolver implements TrickResolver {
  public resolveWinner(trick: Trick, trumpSuit: Suit): PlayerId {
    if (trick.plays.length === 0) {
      throw new Error('Cannot resolve an empty trick.');
    }

    const leadSuit = trick.plays[0].card.suit;
    const winner = trick.plays.reduce((best, play) =>
      this.beats(play, best, trumpSuit, leadSuit) ? play : best,
    );

    return winner.playerId;
  }

  private beats(candidate: PlayedCard, best: PlayedCard, trumpSuit: Suit, leadSuit: Suit): boolean {
    const candidateCard = candidate.card;
    const bestCard = best.card;

    if (candidateCard.suit === trumpSuit && bestCard.suit !== trumpSuit) {
      return true;
    }

    if (candidateCard.suit !== trumpSuit && bestCard.suit === trumpSuit) {
      return false;
    }

    if (candidateCard.suit === bestCard.suit) {
      return candidateCard.captureStrength < bestCard.captureStrength;
    }

    if (candidateCard.suit === leadSuit && bestCard.suit !== leadSuit) {
      return true;
    }

    return false;
  }
}
