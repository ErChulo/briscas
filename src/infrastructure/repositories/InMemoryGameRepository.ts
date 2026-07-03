import type {
  GameRepository,
  GameTransaction,
  PersistedGameUpdate,
} from '../../application/ports/GameRepository';
import { GameNotFoundError } from '../../domain/errors/DomainError';
import type { GameState } from '../../domain/game/GameState';
import type { GameId } from '../../domain/game/Types';
import { GameStateMapper } from '../mappers/GameStateMapper';

/** In-memory repository for Vitest and local human-vs-AI play. */
export class InMemoryGameRepository implements GameRepository {
  private readonly games = new Map<GameId, GameState>();
  private readonly listeners = new Map<GameId, Set<(state: GameState | null) => void>>();

  public async createGame(snapshot: GameState): Promise<void> {
    this.games.set(snapshot.gameId, this.clone(snapshot));
    this.emit(snapshot.gameId);
  }

  public async getGame(gameId: GameId): Promise<GameState | null> {
    const state = this.games.get(gameId);
    return state ? this.clone(state) : null;
  }

  public async updateGame(update: PersistedGameUpdate): Promise<void> {
    this.games.set(update.state.gameId, this.clone(update.state));
    this.emit(update.state.gameId);
  }

  public async runTransaction<T extends PersistedGameUpdate>(
    gameId: GameId,
    operation: GameTransaction<T>,
  ): Promise<T> {
    const state = this.games.get(gameId);
    if (!state) {
      throw new GameNotFoundError('No se encontró la sala.');
    }

    const update = await operation(this.clone(state));
    this.games.set(gameId, this.clone(update.state));
    this.emit(gameId);
    return update;
  }

  public subscribe(gameId: GameId, onChange: (state: GameState | null) => void): () => void {
    const listeners = this.listeners.get(gameId) ?? new Set<(state: GameState | null) => void>();
    listeners.add(onChange);
    this.listeners.set(gameId, listeners);

    void this.getGame(gameId).then(onChange);

    return () => {
      listeners.delete(onChange);
    };
  }

  private emit(gameId: GameId): void {
    const listeners = this.listeners.get(gameId);
    if (!listeners) {
      return;
    }

    const state = this.games.get(gameId) ?? null;
    listeners.forEach((listener) => listener(state ? this.clone(state) : null));
  }

  private clone(state: GameState): GameState {
    return GameStateMapper.fromData(GameStateMapper.toData(state));
  }
}
