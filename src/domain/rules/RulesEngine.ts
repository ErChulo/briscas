import type { Card } from '../cards/Card';
import type { GameState } from '../game/GameState';
import type { PlayerId } from '../game/Types';
import type { ValidationResult } from './ValidationResult';

/** Minimal rules interface consumed by application and presentation code. */
export interface RulesEngine {
  canJoin(state: GameState, playerId: PlayerId): ValidationResult;
  canStart(state: GameState, playerId: PlayerId): ValidationResult;
  canPlayCard(state: GameState, playerId: PlayerId, card: Card): ValidationResult;
  canSwapSeven(state: GameState, playerId: PlayerId): ValidationResult;
  isGameOver(state: GameState): boolean;
  maxPlayers(state: GameState): number;
}
