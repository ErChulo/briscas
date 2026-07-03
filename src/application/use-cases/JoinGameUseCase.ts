import { GameNotFoundError } from '../../domain/errors/DomainError';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { MoveType } from '../../domain/game/Move';
import type { GameId, PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { IdGenerator } from '../services/IdGenerator';

export interface JoinGameCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
  readonly displayName: string;
}

/** Joins a player to a waiting room through a transactional update. */
export class JoinGameUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: JoinGameCommand): Promise<GameState> {
    const existing = await this.repository.getGame(command.gameId);
    if (!existing) {
      throw new GameNotFoundError('No se encontró la sala.');
    }

    const update = await this.repository.runTransaction(command.gameId, (state) => {
      const now = this.clock.now();
      const nextState = this.engine.joinGame(
        state,
        { playerId: command.playerId, displayName: command.displayName },
        now,
      );

      return {
        state: nextState,
        move: {
          id: this.ids.moveId(),
          type: MoveType.JoinGame,
          playerId: command.playerId,
          createdAt: now,
          resultingVersion: nextState.version,
        },
      };
    });

    return update.state;
  }
}
