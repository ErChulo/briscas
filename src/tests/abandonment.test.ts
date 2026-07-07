import { describe, expect, it } from 'vitest';
import { Card } from '../domain/cards/Card';
import { Deck } from '../domain/cards/Deck';
import { Hand } from '../domain/cards/Hand';
import { Suit } from '../domain/cards/Suit';
import { GameEngine } from '../domain/game/GameEngine';
import type { GameState } from '../domain/game/GameState';
import { Player } from '../domain/game/Player';
import { Trick } from '../domain/game/Trick';
import { GameStatus, GameVariant } from '../domain/game/Types';

describe('Player abandonment & heartbeat', () => {
  it('4P abandonment declares the abandonee team as the loser', () => {
    const engine = new GameEngine();
    let state = fourPlayerStartedState();
    const firstPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
    state = engine.playCard(state, firstPlayer.id, firstPlayer.hand.toArray()[0], 100);

    // p1 sits at seat 0 (team-0). Abandoning p1 should mark team-0 as loser and team-1 as winner.
    const abandoned = engine.markPlayerAbandoned(state, 'p1', 200);

    expect(abandoned.status).toBe(GameStatus.Ended);
    expect(abandoned.players.find((player) => player.id === 'p1')?.abandonedAt).toBe(200);
    expect(abandoned.abandonedPlayerIds).toEqual(['p1']);
    expect(abandoned.loserIds).toEqual(['team-0']);
    expect(abandoned.winnerIds).toEqual(['team-1']);
  });

  it('4P abandonment of a team-1 player flips the result', () => {
    const engine = new GameEngine();
    let state = fourPlayerStartedState();
    const firstPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
    state = engine.playCard(state, firstPlayer.id, firstPlayer.hand.toArray()[0], 100);

    // p2 sits at seat 1 (team-1). Abandoning p2 should mark team-1 as loser.
    const abandoned = engine.markPlayerAbandoned(state, 'p2', 250);

    expect(abandoned.status).toBe(GameStatus.Ended);
    expect(abandoned.loserIds).toEqual(['team-1']);
    expect(abandoned.winnerIds).toEqual(['team-0']);
  });

  it('2P abandonment declares the abandonee as the loser', () => {
    const engine = new GameEngine();
    let state = twoPlayerStartedState();
    const firstPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
    state = engine.playCard(state, firstPlayer.id, firstPlayer.hand.toArray()[0], 100);

    const abandoned = engine.markPlayerAbandoned(state, 'p2', 200);

    expect(abandoned.status).toBe(GameStatus.Ended);
    expect(abandoned.loserIds).toEqual(['p2']);
    expect(abandoned.winnerIds).toEqual(['p1']);
    expect(abandoned.abandonedPlayerIds).toEqual(['p2']);
  });

  it('markPlayerAbandoned is a no-op once the game has already ended', () => {
    const engine = new GameEngine();
    const state = endedState();

    const after = engine.markPlayerAbandoned(state, 'p1', 999);

    expect(after).toBe(state);
  });

  it('markPlayerAbandoned ignores already-abandoned players', () => {
    const engine = new GameEngine();
    let state = fourPlayerStartedState();
    const firstPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
    state = engine.playCard(state, firstPlayer.id, firstPlayer.hand.toArray()[0], 100);
    state = engine.markPlayerAbandoned(state, 'p1', 200);

    const second = engine.markPlayerAbandoned(state, 'p1', 300);

    expect(second).toBe(state);
  });

  it('updatePlayerHeartbeat advances lastSeenAt and bumps version', () => {
    const engine = new GameEngine();
    const state = fourPlayerStartedState();
    const baselineVersion = state.version;

    const stamped = engine.updatePlayerHeartbeat(state, 'p4', 500);

    expect(stamped.players.find((player) => player.id === 'p4')?.lastSeenAt).toBe(500);
    expect(stamped.version).toBe(baselineVersion + 1);
  });

  it('Player.isStale flags older-than-grace players and ignores those already abandoned', () => {
    const now = 1_000_000;
    const fresh = new Player('p1', 'A', 0, new Hand(), 0, 0, null, true, now - 5_000, null);
    const stale = new Player('p2', 'B', 1, new Hand(), 0, 0, null, true, now - 60_000, null);
    const gone = new Player('p3', 'C', 2, new Hand(), 0, 0, null, false, now - 90_000, now - 1_000);

    expect(fresh.isStale(now, 45_000)).toBe(false);
    expect(stale.isStale(now, 45_000)).toBe(true);
    expect(gone.isStale(now, 45_000)).toBe(false);
  });
});

function fourPlayerStartedState(): GameState {
  const engine = new GameEngine();
  let state = engine.createGame({
    gameId: 'ABANDON-4P',
    hostPlayerId: 'p1',
    hostDisplayName: 'Host',
    variant: GameVariant.Standard4P,
    now: 0,
  });
  state = engine.joinGame(state, { playerId: 'p2', displayName: 'Left' }, 1);
  state = engine.joinGame(state, { playerId: 'p3', displayName: 'Across' }, 2);
  state = engine.joinGame(state, { playerId: 'p4', displayName: 'Right' }, 3);
  state = engine.startGame(state, 'p1', 42, 4);
  return state;
}

function twoPlayerStartedState(): GameState {
  const engine = new GameEngine();
  let state = engine.createGame({
    gameId: 'ABANDON-2P',
    hostPlayerId: 'p1',
    hostDisplayName: 'Host',
    variant: GameVariant.Standard2P,
    now: 0,
  });
  state = engine.joinGame(state, { playerId: 'p2', displayName: 'Guest' }, 1);
  state = engine.startGame(state, 'p1', 7, 2);
  return state;
}

function endedState(): GameState {
  const trumpCard = new Card(Suit.Copa, 4);
  return {
    gameId: 'ENDED',
    status: GameStatus.Ended,
    variant: GameVariant.Standard2P,
    hostPlayerId: 'p1',
    players: [
      new Player('p1', 'Ana', 0, new Hand()),
      new Player('p2', 'Luis', 1, new Hand()),
    ],
    deck: new Deck([], trumpCard),
    trumpCard,
    currentTrick: new Trick(null),
    lastCompletedTrick: null,
    lastTrickWinnerId: null,
    currentPlayerId: null,
    trumpExchangeUsed: false,
    dealerSeatIndex: 0,
    scores: { p1: 60, p2: 60 },
    scoreHistory: [{ trickIndex: 0, scores: { p1: 60, p2: 60 } }],
    roundNumber: 1,
    deckSeed: 10,
    winnerIds: [],
    abandonedPlayerIds: [],
    loserIds: [],
    version: 5,
    createdAt: 0,
    updatedAt: 5,
  };
}
