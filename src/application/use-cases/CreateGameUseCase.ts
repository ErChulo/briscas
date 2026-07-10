import { IllegalMoveError } from '../../domain/errors/DomainError';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { MoveType } from '../../domain/game/Move';
import { GameVariant, type PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { IdGenerator } from '../services/IdGenerator';

export interface CreateGameCommand {
  readonly hostPlayerId: PlayerId;
  readonly hostDisplayName: string;
  readonly variant: GameVariant;
}

const MAX_ROOM_CODE_ATTEMPTS = 8;

/** Creates a waiting room and persists the initial domain snapshot. */
export class CreateGameUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: CreateGameCommand): Promise<GameState> {
    const now = this.clock.now();
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const gameId = this.ids.gameId();
      const existing = await this.safeGetGame(gameId);
      if (existing) {
        continue;
      }

      const state = this.engine.createGame({
        gameId,
        hostPlayerId: command.hostPlayerId,
        hostDisplayName: command.hostDisplayName,
        variant: command.variant,
        now,
      });

      await this.repository.createGame(state);
      await this.repository.updateGame({
        state,
        move: {
          id: this.ids.moveId(),
          type: MoveType.CreateGame,
          playerId: command.hostPlayerId,
          createdAt: now,
          resultingVersion: state.version,
        },
      });

      return state;
    }

    throw new IllegalMoveError('No se pudo crear un código de sala único. Intenta nuevamente.');
  }

  private async safeGetGame(gameId: string): Promise<GameState | null> {
    try {
      return await this.repository.getGame(gameId);
    } catch {
      // Some adapters may not be allowed to read non-participant rooms. In that
      // case, keep creation working and let the backend/security rules arbitrate.
      return null;
    }
  }
}
