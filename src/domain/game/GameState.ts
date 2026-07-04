import type { Card } from '../cards/Card';
import { Deck } from '../cards/Deck';
import { Player } from './Player';
import { Trick } from './Trick';
import { GameStatus, GameVariant, type GameId, type PlayerId } from './Types';

/** Complete framework-agnostic game state. */
export interface GameState {
  readonly gameId: GameId;
  readonly status: GameStatus;
  readonly variant: GameVariant;
  readonly hostPlayerId: PlayerId;
  readonly players: readonly Player[];
  readonly deck: Deck;
  readonly trumpCard: Card | null;
  readonly currentTrick: Trick;
  readonly lastCompletedTrick: Trick | null;
  readonly lastTrickWinnerId: PlayerId | null;
  readonly currentPlayerId: PlayerId | null;
  readonly dealerSeatIndex: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly roundNumber: number;
  readonly deckSeed: number | null;
  readonly winnerIds: readonly string[];
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Behavior-oriented wrapper around GameState. */
export class Game {
  public constructor(public readonly state: GameState) {}

  public get isWaiting(): boolean {
    return this.state.status === GameStatus.Waiting;
  }

  public get isPlaying(): boolean {
    return this.state.status === GameStatus.Playing;
  }

  public get isEnded(): boolean {
    return this.state.status === GameStatus.Ended;
  }

  public player(playerId: PlayerId): Player | undefined {
    return this.state.players.find((player) => player.id === playerId);
  }
}
