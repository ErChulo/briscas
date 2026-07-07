import type { GameRepository, PersistedGameUpdate } from '../ports/GameRepository';
import type { IdGenerator } from '../services/IdGenerator';
import type { Clock } from '../services/Clock';
import type { GameEngine } from '../../domain/game/GameEngine';
import { MoveType } from '../../domain/game/Move';
import type { GameState } from '../../domain/game/GameState';
import type { GameId, PlayerId } from '../../domain/game/Types';

export interface MarkPlayerAbandonedCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
  /** Optional PlayerId of the participant that triggered the declaration. */
  readonly reportedBy?: PlayerId;
}

/**
 * Declares `playerId` abandoned inside a transaction so concurrent calls converge.
 * The abandonee's team (in 4-player mode) or the player themselves (in 2-player
 * mode) is recorded as the loser; the rest of the room wins by default.
 */
export class MarkPlayerAbandonedUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: MarkPlayerAbandonedCommand): Promise<GameState> {
    const update = await this.repository.runTransaction<PersistedGameUpdate>(command.gameId, (state) => {
      const now = this.clock.now();
      const nextState = this.engine.markPlayerAbandoned(state, command.playerId, now);
      if (nextState === state) {
        return { state };
      }

      return {
        state: nextState,
        move: {
          id: this.ids.moveId(),
          type: MoveType.AbandonGame,
          playerId: command.reportedBy ?? command.playerId,
          createdAt: now,
          resultingVersion: nextState.version,
        },
      };
    });

    return update.state;
  }
}
