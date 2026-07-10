import { describe, expect, it } from 'vitest';
import { CreateGameUseCase } from '../application/use-cases/CreateGameUseCase';
import { JoinGameUseCase } from '../application/use-cases/JoinGameUseCase';
import { PlayCardUseCase } from '../application/use-cases/PlayCardUseCase';
import { ResetGameUseCase } from '../application/use-cases/ResetGameUseCase';
import { StartGameUseCase } from '../application/use-cases/StartGameUseCase';
import type { Clock } from '../application/services/Clock';
import type { IdGenerator } from '../application/services/IdGenerator';
import { GameEngine } from '../domain/game/GameEngine';
import { GameStatus, GameVariant } from '../domain/game/Types';
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

  it('retries room code generation when a collision exists', async () => {
    const repository = new InMemoryGameRepository();
    const engine = new GameEngine();
    const clock = new FixedClock();
    const first = new CreateGameUseCase(repository, engine, new FixedIds(), clock);
    const second = new CreateGameUseCase(repository, engine, new SequenceIds(['ROOM42', 'ROOM99']), clock);

    await first.execute({ hostPlayerId: 'p1', hostDisplayName: 'Ana', variant: GameVariant.Standard2P });
    const created = await second.execute({ hostPlayerId: 'p2', hostDisplayName: 'Luis', variant: GameVariant.Standard2P });

    expect(created.gameId).toBe('ROOM99');
  });

  it('allows only the host to reset an ended game', async () => {
    const repository = new InMemoryGameRepository();
    const engine = new GameEngine();
    const ids = new FixedIds();
    const clock = new FixedClock();
    const createGame = new CreateGameUseCase(repository, engine, ids, clock);
    const joinGame = new JoinGameUseCase(repository, engine, ids, clock);
    const resetGame = new ResetGameUseCase(repository, engine, ids, clock);

    const created = await createGame.execute({ hostPlayerId: 'p1', hostDisplayName: 'Ana', variant: GameVariant.Standard2P });
    const joined = await joinGame.execute({ gameId: created.gameId, playerId: 'p2', displayName: 'Luis' });

    await repository.updateGame({
      state: {
        ...joined,
        status: GameStatus.Ended,
        roundOutcome: { type: 'win', winnerOwnerIds: ['p1'] },
        winnerIds: ['p1'],
      },
    });

    await expect(resetGame.execute({ gameId: created.gameId, playerId: 'p2' })).rejects.toThrow('Solo el anfitrión');
    const reset = await resetGame.execute({ gameId: created.gameId, playerId: 'p1' });

    expect(reset.status).toBe(GameStatus.Waiting);
    expect(reset.roundOutcome).toBeNull();
    expect(reset.roundNumber).toBe(joined.roundNumber + 1);
  });

  it('rejects resetting an active game', async () => {
    const repository = new InMemoryGameRepository();
    const engine = new GameEngine();
    const ids = new FixedIds();
    const clock = new FixedClock();
    const createGame = new CreateGameUseCase(repository, engine, ids, clock);
    const joinGame = new JoinGameUseCase(repository, engine, ids, clock);
    const startGame = new StartGameUseCase(repository, engine, ids, clock);
    const resetGame = new ResetGameUseCase(repository, engine, ids, clock);

    const created = await createGame.execute({ hostPlayerId: 'p1', hostDisplayName: 'Ana', variant: GameVariant.Standard2P });
    const joined = await joinGame.execute({ gameId: created.gameId, playerId: 'p2', displayName: 'Luis' });
    const started = await startGame.execute({ gameId: joined.gameId, playerId: 'p1' });

    await expect(resetGame.execute({ gameId: started.gameId, playerId: 'p1' })).rejects.toThrow('partida activa');
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

class SequenceIds extends FixedIds {
  private index = 0;

  public constructor(private readonly gameIds: readonly string[]) {
    super();
  }

  public override gameId(): string {
    const value = this.gameIds[this.index] ?? this.gameIds.at(-1) ?? 'ROOM42';
    this.index += 1;
    return value;
  }
}
