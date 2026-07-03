import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { MoveType } from '../../domain/game/Move';
import type { GameId, PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { IdGenerator } from '../services/IdGenerator';

export interface StartGameCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
}

/** Starts the game and deals hands from a deterministic deck seed. */
export class StartGameUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: StartGameCommand): Promise<GameState> {
    const update = await this.repository.runTransaction(command.gameId, (state) => {
      const now = this.clock.now();
      const nextState = this.engine.startGame(state, command.playerId, this.ids.seed(), now);

      return {
        state: nextState,
        move: {
          id: this.ids.moveId(),
          type: MoveType.StartGame,
          playerId: command.playerId,
          createdAt: now,
          resultingVersion: nextState.version,
        },
      };
    });

    return update.state;
  }
}
