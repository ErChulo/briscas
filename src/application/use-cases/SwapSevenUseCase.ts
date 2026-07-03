import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { MoveType } from '../../domain/game/Move';
import type { GameId, PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { IdGenerator } from '../services/IdGenerator';

export interface SwapSevenCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
}

/** Executes the optional seven-of-trump exchange rule. */
export class SwapSevenUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: SwapSevenCommand): Promise<GameState> {
    const update = await this.repository.runTransaction(command.gameId, (state) => {
      const now = this.clock.now();
      const nextState = this.engine.swapSeven(state, command.playerId, now);

      return {
        state: nextState,
        move: {
          id: this.ids.moveId(),
          type: MoveType.SwapSeven,
          playerId: command.playerId,
          createdAt: now,
          resultingVersion: nextState.version,
        },
      };
    });

    return update.state;
  }
}
