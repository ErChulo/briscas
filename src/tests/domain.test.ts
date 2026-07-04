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
import { BriscasRules } from '../domain/rules/BriscasRules';
import { StandardTrickResolver } from '../domain/rules/TrickResolver';
import { StandardScoringService } from '../domain/scoring/ScoringService';
import { GameStateMapper } from '../infrastructure/mappers/GameStateMapper';

describe('Spanish deck and card values', () => {
  it('builds a 40-card Spanish deck worth 120 points', () => {
    const cards = Deck.spanishDeck().toArray();

    expect(cards).toHaveLength(40);
    expect(new Set(cards.map((card) => card.id))).toHaveLength(40);
    expect(cards.reduce((total, card) => total + card.pointValue, 0)).toBe(120);
  });

  it('assigns Briscas points and capture strength from the DOCX table', () => {
    const ace = new Card(Suit.Oro, 1);
    const three = new Card(Suit.Oro, 3);
    const king = new Card(Suit.Oro, 12);

    expect(ace.pointValue).toBe(11);
    expect(three.pointValue).toBe(10);
    expect(king.pointValue).toBe(4);
    expect(ace.captureStrength).toBeLessThan(three.captureStrength);
    expect(three.captureStrength).toBeLessThan(king.captureStrength);
  });
});

describe('Trick resolution and scoring', () => {
  it('lets a trump card beat a stronger non-trump card', () => {
    const trick = new Trick('p1')
      .addPlay('p1', new Card(Suit.Oro, 1))
      .addPlay('p2', new Card(Suit.Copa, 2));

    expect(new StandardTrickResolver().resolveWinner(trick, Suit.Copa)).toBe('p2');
  });

  it('resolves same-suit tricks by capture strength', () => {
    const trick = new Trick('p1')
      .addPlay('p1', new Card(Suit.Espada, 12))
      .addPlay('p2', new Card(Suit.Espada, 3));

    expect(new StandardTrickResolver().resolveWinner(trick, Suit.Oro)).toBe('p2');
  });

  it('scores captured card points', () => {
    const trick = new Trick('p1')
      .addPlay('p1', new Card(Suit.Oro, 1))
      .addPlay('p2', new Card(Suit.Basto, 10));

    expect(new StandardScoringService().scoreTrick(trick)).toBe(13);
  });
});

describe('Game engine rules', () => {
  it('accepts legal moves and rejects a play out of turn', () => {
    const engine = new GameEngine();
    let state = engine.createGame({
      gameId: 'ROOM01',
      hostPlayerId: 'p1',
      hostDisplayName: 'Ana',
      variant: GameVariant.Standard2P,
      now: 1,
    });
    state = engine.joinGame(state, { playerId: 'p2', displayName: 'Luis' }, 2);
    state = engine.startGame(state, 'p1', 1234, 3);

    const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
    const card = currentPlayer.hand.toArray()[0];
    const nextState = engine.playCard(state, currentPlayer.id, card, 4);

    expect(nextState.currentTrick.plays).toHaveLength(1);
    expect(() => engine.playCard(nextState, currentPlayer.id, currentPlayer.hand.toArray()[1], 5)).toThrow('No es tu turno');
  });

  it('detects an ended game and computes the round winner', () => {
    const rules = new BriscasRules();
    const scoring = new StandardScoringService();
    const state = endedState({ p1: 61, p2: 59 }, false);

    expect(rules.isGameOver(state)).toBe(true);
    expect(scoring.scoreRound(state).winnerIds).toEqual(['p1']);
  });

  it('serializes and deserializes game state without losing cards or turn data', () => {
    const state = endedState({ p1: 60, p2: 60 }, true);
    const restored = GameStateMapper.fromData(GameStateMapper.toData(state));

    expect(restored.gameId).toBe(state.gameId);
    expect(restored.players[0].hand.toArray()[0].id).toBe('oro-1');
    expect(restored.scores).toEqual(state.scores);
  });
});

function endedState(scores: Record<string, number>, includeCardInHand: boolean): GameState {
  const trumpCard = new Card(Suit.Copa, 4);

  return {
    gameId: 'ENDED',
    status: GameStatus.Ended,
    variant: GameVariant.Standard2P,
    hostPlayerId: 'p1',
    players: [
      new Player('p1', 'Ana', 0, new Hand(includeCardInHand ? [new Card(Suit.Oro, 1)] : [])),
      new Player('p2', 'Luis', 1, new Hand()),
    ],
    deck: new Deck([], trumpCard),
    trumpCard,
    currentTrick: new Trick(null),
    lastCompletedTrick: null,
    lastTrickWinnerId: null,
    currentPlayerId: null,
    dealerSeatIndex: 0,
    scores,
    roundNumber: 1,
    deckSeed: 10,
    winnerIds: [],
    version: 1,
    createdAt: 1,
    updatedAt: 2,
  };
}
