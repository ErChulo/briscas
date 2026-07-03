import type { GameState } from '../../domain/game/GameState';
import type { Move } from '../../domain/game/Move';
import type { GameId } from '../../domain/game/Types';

export interface PersistedGameUpdate {
  readonly state: GameState;
  readonly move?: Move;
}

export type GameTransaction<T = PersistedGameUpdate> = (state: GameState) => Promise<T> | T;

/** Persistence abstraction substituted by Firestore and in-memory repositories. */
export interface GameRepository {
  createGame(snapshot: GameState): Promise<void>;
  getGame(gameId: GameId): Promise<GameState | null>;
  updateGame(update: PersistedGameUpdate): Promise<void>;
  runTransaction<T extends PersistedGameUpdate>(gameId: GameId, operation: GameTransaction<T>): Promise<T>;
  subscribe(gameId: GameId, onChange: (state: GameState | null) => void): () => void;
}
