import { Card } from '../cards/Card';
import { Deck } from '../cards/Deck';
import { Hand } from '../cards/Hand';
import {
  CardNotInHandError,
  GameAlreadyStartedError,
  IllegalMoveError,
  InvalidGameStateError,
  NotPlayersTurnError,
  RoomFullError,
} from '../errors/DomainError';
import { BriscasRules } from '../rules/BriscasRules';
import type { RulesEngine, TrumpSwapRank } from '../rules/RulesEngine';
import { StandardTrickResolver, type TrickResolver } from '../rules/TrickResolver';
import { StandardScoringService, type ScoringService } from '../scoring/ScoringService';
import { Dealer } from './Dealer';
import type { GameState } from './GameState';
import { Player } from './Player';
import { Score } from './Score';
import { Trick } from './Trick';
import { GameStatus, GameVariant, type GameId, type PlayerId, type TeamId } from './Types';

export interface CreateGameInput {
  readonly gameId: GameId;
  readonly hostPlayerId: PlayerId;
  readonly hostDisplayName: string;
  readonly variant: GameVariant;
  readonly now: number;
}

export interface JoinGameInput {
  readonly playerId: PlayerId;
  readonly displayName: string;
}

/**
 * Orchestrates Briscas state transitions by depending on rules, resolving, scoring,
 * and dealing abstractions instead of infrastructure or UI code.
 */
export class GameEngine {
  public constructor(
    private readonly rules: RulesEngine = new BriscasRules(),
    private readonly trickResolver: TrickResolver = new StandardTrickResolver(),
    private readonly scoringService: ScoringService = new StandardScoringService(),
    private readonly dealer: Dealer = new Dealer(),
  ) {}

  public createGame(input: CreateGameInput): GameState {
    const host = new Player(
      input.hostPlayerId,
      input.hostDisplayName,
      0,
      new Hand(),
      0,
      0,
      this.teamIdForSeat(input.variant, 0),
    );

    const scores = this.initialScores([host]);

    return {
      gameId: input.gameId,
      status: GameStatus.Waiting,
      variant: input.variant,
      hostPlayerId: input.hostPlayerId,
      players: [host],
      deck: new Deck([]),
      trumpCard: null,
      currentTrick: new Trick(null),
      lastCompletedTrick: null,
      lastTrickWinnerId: null,
      currentPlayerId: null,
      trumpExchangeUsed: false,
      dealerSeatIndex: 0,
      scores,
      scoreHistory: [],
      roundNumber: 1,
      deckSeed: null,
      winnerIds: [],
      version: 0,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  public joinGame(state: GameState, input: JoinGameInput, now: number): GameState {
    if (state.status === GameStatus.Waiting && state.players.some((player) => player.id === input.playerId)) {
      return state;
    }

    const validation = this.rules.canJoin(state, input.playerId);
    if (!validation.valid) {
      throw new RoomFullError(validation.reason ?? 'La sala está llena.');
    }

    const seatIndex = state.players.length;
    const player = new Player(
      input.playerId,
      input.displayName,
      seatIndex,
      new Hand(),
      0,
      0,
      this.teamIdForSeat(state.variant, seatIndex),
    );
    const players = [...state.players, player];

    return {
      ...state,
      players,
      scores: this.initialScores(players),
      version: state.version + 1,
      updatedAt: now,
    };
  }

  public startGame(state: GameState, playerId: PlayerId, seed: number, now: number): GameState {
    const validation = this.rules.canStart(state, playerId);
    if (!validation.valid) {
      throw new GameAlreadyStartedError(validation.reason ?? 'No se puede iniciar la partida.');
    }

    const deal = this.dealer.dealInitialHands(this.sortedPlayers(state.players), seed);
    const firstPlayer = this.playerAfterSeat(deal.players, state.dealerSeatIndex);
    const scores = this.initialScores(deal.players);

    return {
      ...state,
      status: GameStatus.Playing,
      players: deal.players,
      deck: deal.deck,
      trumpCard: deal.deck.trumpCard,
      currentTrick: new Trick(firstPlayer.id),
      lastCompletedTrick: null,
      lastTrickWinnerId: null,
      currentPlayerId: firstPlayer.id,
      trumpExchangeUsed: false,
      scores,
      scoreHistory: [{ trickIndex: 0, scores }],
      deckSeed: seed,
      winnerIds: [],
      version: state.version + 1,
      updatedAt: now,
    };
  }

  public playCard(state: GameState, playerId: PlayerId, card: Card, now: number): GameState {
    const validation = this.rules.canPlayCard(state, playerId, card);
    if (!validation.valid) {
      const reason = validation.reason ?? 'La jugada no es válida.';
      if (state.currentPlayerId !== playerId) {
        throw new NotPlayersTurnError(reason);
      }

      throw new CardNotInHandError(reason);
    }

    const playersAfterPlay = state.players.map((player) =>
      player.id === playerId ? player.withHand(player.hand.remove(card)) : player,
    );
    const trickAfterPlay = state.currentTrick.addPlay(playerId, card);
    const playedState = {
      ...state,
      players: playersAfterPlay,
      currentTrick: trickAfterPlay,
      lastCompletedTrick: null,
      lastTrickWinnerId: null,
      updatedAt: now,
    } satisfies GameState;

    if (!trickAfterPlay.isComplete(state.players.length)) {
      return {
        ...playedState,
        currentPlayerId: this.nextPlayerId(playersAfterPlay, playerId),
        version: state.version + 1,
      };
    }

    return this.finishTrick(playedState, now, true);
  }

  public finishTrick(state: GameState, now: number, incrementVersion = false): GameState {
    if (!state.currentTrick.isComplete(state.players.length)) {
      throw new InvalidGameStateError('La baza todavía no está completa.');
    }

    if (!state.trumpCard) {
      throw new InvalidGameStateError('No hay palo triunfo configurado.');
    }

    const winnerId = this.trickResolver.resolveWinner(state.currentTrick, state.trumpCard.suit);
    const points = this.scoringService.scoreTrick(state.currentTrick);
    const winner = state.players.find((player) => player.id === winnerId);
    if (!winner) {
      throw new InvalidGameStateError('El ganador de la baza no existe.');
    }

    let deck = state.deck;
    let players = state.players.map((player) => (player.id === winnerId ? player.withCapturedTrick() : player));
    const scoreOwnerId = this.scoreOwnerId(winner);
    const scores = new Score(state.scores).add(scoreOwnerId, points).toRecord();
    const scoreHistory = [...state.scoreHistory, { trickIndex: state.scoreHistory.length, scores }];
    const drawOrder = this.drawOrder(players, winnerId);

    for (const drawPlayerId of drawOrder) {
      if (deck.isEmpty) {
        break;
      }

      const draw = deck.draw();
      deck = draw.deck;
      if (draw.card) {
        players = players.map((player) =>
          player.id === drawPlayerId ? player.withHand(player.hand.add(draw.card as Card)) : player,
        );
      }
    }

    const clearedTrickState: GameState = {
      ...state,
      players,
      deck,
      trumpCard: deck.trumpCard ?? state.trumpCard,
      currentTrick: new Trick(winnerId),
      lastCompletedTrick: state.currentTrick,
      lastTrickWinnerId: winnerId,
      currentPlayerId: winnerId,
      scores,
      scoreHistory,
      version: incrementVersion ? state.version + 1 : state.version,
      updatedAt: now,
    };

    if (this.rules.isGameOver({ ...clearedTrickState, currentTrick: new Trick(null) })) {
      const endedState = {
        ...clearedTrickState,
        status: GameStatus.Ended,
        currentTrick: new Trick(null),
        currentPlayerId: null,
        trumpCard: null,
      } satisfies GameState;
      const scoreResult = this.scoringService.scoreRound(endedState);

      return {
        ...endedState,
        winnerIds: scoreResult.winnerIds,
      };
    }

    return clearedTrickState;
  }

  public swapSeven(state: GameState, playerId: PlayerId, now: number): GameState {
    return this.swapTrump(state, playerId, 7, now);
  }

  public swapTrump(state: GameState, playerId: PlayerId, exchangeRank: TrumpSwapRank, now: number): GameState {
    const validation = this.rules.canSwapTrump(state, playerId, exchangeRank);
    if (!validation.valid) {
      throw new IllegalMoveError(validation.reason ?? 'No se puede intercambiar.');
    }

    if (!state.trumpCard) {
      throw new InvalidGameStateError('No hay triunfo para intercambiar.');
    }

    const exchangeCard = new Card(state.trumpCard.suit, exchangeRank);
    const players = state.players.map((player) => {
      if (player.id !== playerId) {
        return player;
      }

      return player.withHand(player.hand.remove(exchangeCard).add(state.trumpCard as Card));
    });
    const deck = state.deck.replaceTrumpCard(exchangeCard);

    return {
      ...state,
      players,
      deck,
      trumpCard: exchangeCard,
      trumpExchangeUsed: true,
      version: state.version + 1,
      updatedAt: now,
    };
  }

  public resetGame(state: GameState, now: number): GameState {
    const players = this.sortedPlayers(state.players).map(
      (player) =>
        new Player(player.id, player.displayName, player.seatIndex, new Hand(), 0, 0, player.teamId, player.connected),
    );
    const scores = this.initialScores(players);

    return {
      ...state,
      status: GameStatus.Waiting,
      players,
      deck: new Deck([]),
      trumpCard: null,
      currentTrick: new Trick(null),
      lastCompletedTrick: null,
      lastTrickWinnerId: null,
      currentPlayerId: null,
      trumpExchangeUsed: false,
      scores,
      scoreHistory: [],
      roundNumber: state.roundNumber + 1,
      dealerSeatIndex: (state.dealerSeatIndex + 1) % Math.max(players.length, 1),
      deckSeed: null,
      winnerIds: [],
      version: state.version + 1,
      updatedAt: now,
    };
  }

  private sortedPlayers(players: readonly Player[]): readonly Player[] {
    return [...players].sort((left, right) => left.seatIndex - right.seatIndex);
  }

  private playerAfterSeat(players: readonly Player[], dealerSeatIndex: number): Player {
    const sortedPlayers = this.sortedPlayers(players);
    return sortedPlayers[(dealerSeatIndex + 1) % sortedPlayers.length];
  }

  private nextPlayerId(players: readonly Player[], playerId: PlayerId): PlayerId {
    const sortedPlayers = this.sortedPlayers(players);
    const index = sortedPlayers.findIndex((player) => player.id === playerId);
    return sortedPlayers[(index + 1) % sortedPlayers.length].id;
  }

  private drawOrder(players: readonly Player[], winnerId: PlayerId): readonly PlayerId[] {
    const sortedPlayers = this.sortedPlayers(players);
    const winnerIndex = sortedPlayers.findIndex((player) => player.id === winnerId);
    return sortedPlayers.map((_, offset) => sortedPlayers[(winnerIndex + offset) % sortedPlayers.length].id);
  }

  private teamIdForSeat(variant: GameVariant, seatIndex: number): TeamId | null {
    if (variant !== GameVariant.Standard4P) {
      return null;
    }

    return seatIndex % 2 === 0 ? 'team-0' : 'team-1';
  }

  private scoreOwnerId(player: Player): string {
    return player.teamId ?? player.id;
  }

  private initialScores(players: readonly Player[]): Readonly<Record<string, number>> {
    return players.reduce<Record<string, number>>((scores, player) => {
      scores[this.scoreOwnerId(player)] = 0;
      return scores;
    }, {});
  }
}
