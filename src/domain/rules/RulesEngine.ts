import type { Card } from '../cards/Card';
import type { Rank } from '../cards/Rank';
import type { GameState } from '../game/GameState';
import type { PlayerId } from '../game/Types';
import type { ValidationResult } from './ValidationResult';

export type TrumpSwapRank = Extract<Rank, 2 | 7>;

/** Minimal rules interface consumed by application and presentation code. */
export interface RulesEngine {
  canJoin(state: GameState, playerId: PlayerId): ValidationResult;
  canStart(state: GameState, playerId: PlayerId): ValidationResult;
  canPlayCard(state: GameState, playerId: PlayerId, card: Card): ValidationResult;
  canSwapTrump(state: GameState, playerId: PlayerId, exchangeRank: TrumpSwapRank): ValidationResult;
  canSwapSeven(state: GameState, playerId: PlayerId): ValidationResult;
  isGameOver(state: GameState): boolean;
  maxPlayers(state: GameState): number;
}
