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
    const state = this.engine.createGame({
      gameId: this.ids.gameId(),
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
}
