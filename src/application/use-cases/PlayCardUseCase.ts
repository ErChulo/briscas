import { Card } from '../../domain/cards/Card';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { MoveType } from '../../domain/game/Move';
import type { GameId, PlayerId } from '../../domain/game/Types';
import type { GameRepository } from '../ports/GameRepository';
import type { Clock } from '../services/Clock';
import type { IdGenerator } from '../services/IdGenerator';

export interface PlayCardCommand {
  readonly gameId: GameId;
  readonly playerId: PlayerId;
  readonly cardId: string;
}

/** Applies a card play atomically and lets the engine resolve/draw if a trick ends. */
export class PlayCardUseCase {
  public constructor(
    private readonly repository: GameRepository,
    private readonly engine: GameEngine,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(command: PlayCardCommand): Promise<GameState> {
    const update = await this.repository.runTransaction(command.gameId, (state) => {
      const now = this.clock.now();
      const card = Card.fromId(command.cardId);
      const nextState = this.engine.playCard(state, command.playerId, card, now);

      return {
        state: nextState,
        move: {
          id: this.ids.moveId(),
          type: MoveType.PlayCard,
          playerId: command.playerId,
          card,
          createdAt: now,
          resultingVersion: nextState.version,
        },
      };
    });

    return update.state;
  }
}
