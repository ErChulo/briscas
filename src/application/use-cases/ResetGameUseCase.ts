import { IllegalMoveError } from '../../domain/errors/DomainError';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { MoveType } from '../../domain/game/Move';
import { GameStatus, type GameId, type PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { IdGenerator } from '../services/IdGenerator';

export interface ResetGameCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
}

/** Starts a new waiting round after an ended game. */
export class ResetGameUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: ResetGameCommand): Promise<GameState> {
    const update = await this.repository.runTransaction(command.gameId, (state) => {
      if (state.status !== GameStatus.Ended) {
        throw new IllegalMoveError('Una partida activa no se puede reiniciar. Espera al resultado final.');
      }

      if (state.hostPlayerId !== command.playerId) {
        throw new IllegalMoveError('Solo el anfitrión puede iniciar una nueva ronda.');
      }

      const now = this.clock.now();
      const nextState = this.engine.resetGame(state, now);

      return {
        state: nextState,
        move: {
          id: this.ids.moveId(),
          type: MoveType.ResetGame,
          playerId: command.playerId,
          createdAt: now,
          resultingVersion: nextState.version,
        },
      };
    });

    return update.state;
  }
}
