import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { GameEngine } from '../../domain/game/GameEngine';
import { GameStatus, type GameId, type PlayerId } from '../../domain/game/Types';

export interface HeartbeatCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
}

/**
 * Bumps the local player's `lastSeenAt` so other clients can detect abandonment.
 * Intended to be invoked every few seconds while in `Playing`.
 */
export class HeartbeatUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly clock: Clock,
  ) {}

  public async execute(command: HeartbeatCommand): Promise<void> {
    const state = await this.repository.getGame(command.gameId);
    if (!state || state.status !== GameStatus.Playing) {
      return;
    }

    const next = this.engine.updatePlayerHeartbeat(state, command.playerId, this.clock.now());
    if (next === state) {
      return;
    }

    await this.repository.updateGame({ state: next });
  }
}
