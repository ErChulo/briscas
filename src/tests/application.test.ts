import { describe, expect, it } from 'vitest';
import { CreateGameUseCase } from '../application/use-cases/CreateGameUseCase';
import { JoinGameUseCase } from '../application/use-cases/JoinGameUseCase';
import { PlayCardUseCase } from '../application/use-cases/PlayCardUseCase';
import { StartGameUseCase } from '../application/use-cases/StartGameUseCase';
import type { Clock } from '../application/services/Clock';
import type { IdGenerator } from '../application/services/IdGenerator';
import { GameEngine } from '../domain/game/GameEngine';
import { GameVariant } from '../domain/game/Types';
import { InMemoryGameRepository } from '../infrastructure/repositories/InMemoryGameRepository';

describe('application use cases', () => {
  it('creates, joins, starts, and plays through the repository abstraction', async () => {
    const repository = new InMemoryGameRepository();
    const engine = new GameEngine();
    const ids = new FixedIds();
    const clock = new FixedClock();
    const createGame = new CreateGameUseCase(repository, engine, ids, clock);
    const joinGame = new JoinGameUseCase(repository, engine, ids, clock);
    const startGame = new StartGameUseCase(repository, engine, ids, clock);
    const playCard = new PlayCardUseCase(repository, engine, ids, clock);

    const created = await createGame.execute({
      hostPlayerId: 'p1',
      hostDisplayName: 'Ana',
      variant: GameVariant.Standard2P,
    });
    const joined = await joinGame.execute({ gameId: created.gameId, playerId: 'p2', displayName: 'Luis' });
    const started = await startGame.execute({ gameId: joined.gameId, playerId: 'p1' });
    const currentPlayer = started.players.find((player) => player.id === started.currentPlayerId)!;
    const card = currentPlayer.hand.toArray()[0];
    const afterPlay = await playCard.execute({ gameId: started.gameId, playerId: currentPlayer.id, cardId: card.id });

    expect(created.gameId).toBe('ROOM42');
    expect(joined.players).toHaveLength(2);
    expect(started.players.every((player) => player.hand.size === 3)).toBe(true);
    expect(afterPlay.currentTrick.plays[0].card.id).toBe(card.id);
  });
});

class FixedClock implements Clock {
  private value = 1;

  public now(): number {
    this.value += 1;
    return this.value;
  }
}

class FixedIds implements IdGenerator {
  private move = 0;

  public gameId(): string {
    return 'ROOM42';
  }

  public moveId(): string {
    this.move += 1;
    return `move-${this.move}`;
  }

  public seed(): number {
    return 777;
  }
}
