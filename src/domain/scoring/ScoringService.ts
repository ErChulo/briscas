import type { GameState } from '../game/GameState';
import type { Trick } from '../game/Trick';

export interface ScoreResult {
  readonly winnerIds: readonly string[];
  readonly isDraw: boolean;
  readonly scores: Readonly<Record<string, number>>;
}

/** Interface segregation: scoring can vary independently from trick resolution. */
export interface ScoringService {
  scoreTrick(trick: Trick): number;
  scoreRound(state: GameState): ScoreResult;
}

export class StandardScoringService implements ScoringService {
  public scoreTrick(trick: Trick): number {
    return trick.plays.reduce((total, play) => total + play.card.pointValue, 0);
  }

  public scoreRound(state: GameState): ScoreResult {
    const entries = Object.entries(state.scores);
    const highScore = Math.max(...entries.map(([, score]) => score));
    const winnerIds = entries.filter(([, score]) => score === highScore).map(([ownerId]) => ownerId);
    const isDraw = winnerIds.length > 1 || highScore === 60;

    return {
      winnerIds: isDraw ? winnerIds : entries.filter(([, score]) => score > 60).map(([ownerId]) => ownerId),
      isDraw,
      scores: state.scores,
    };
  }
}
