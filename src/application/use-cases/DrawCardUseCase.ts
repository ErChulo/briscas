import type { GameState } from '../../domain/game/GameState';
import type { GameId, PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import { FinishTrickUseCase } from './FinishTrickUseCase';

export interface DrawCardCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
}

/**
 * Keeps the drawing phase explicit for application architecture. In standard
 * Briscas this delegates to FinishTrickUseCase because the winner draws first
 * immediately after a completed trick.
 */
export class DrawCardUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly finishTrick: FinishTrickUseCase,
  ) {}

  public async execute(command: DrawCardCommand): Promise<GameState> {
    const state = await this.repository.getGame(command.gameId);
    if (state?.currentTrick.isComplete(state.players.length)) {
      return this.finishTrick.execute(command);
    }

    return state as GameState;
  }
}
