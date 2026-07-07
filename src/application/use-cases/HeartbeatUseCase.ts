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
 *
 * Uses a Firestore transaction so the heartbeat never overwrites a concurrent
 * game-action write (e.g. a card play that incremented the game version).
 */
export class HeartbeatUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly clock: Clock,
  ) {}

  public async execute(command: HeartbeatCommand): Promise<void> {
    try {
      await this.repository.runTransaction(command.gameId, (state) => {
        if (state.status !== GameStatus.Playing) {
          return { state };
        }

        const next = this.engine.updatePlayerHeartbeat(state, command.playerId, this.clock.now());
        return { state: next };
      });
    } catch {
      // Transaction failed (e.g. game not found, concurrent write) — silently
      // ignore so a single missed heartbeat doesn't crash the loop.
    }
  }
}
