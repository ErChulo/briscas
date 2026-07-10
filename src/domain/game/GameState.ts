import type { Card } from '../cards/Card';
import { Deck } from '../cards/Deck';
import { Player } from './Player';
import { Trick } from './Trick';
import { GameStatus, GameVariant, type GameId, type PlayerId } from './Types';

export type RoundOutcome =
  | { readonly type: 'win'; readonly winnerOwnerIds: readonly string[] }
  | { readonly type: 'draw' }
  | {
      readonly type: 'abandonment';
      readonly winnerOwnerIds: readonly string[];
      readonly loserPlayerIds: readonly PlayerId[];
    };

export interface ScoreHistoryEntry {
  readonly trickIndex: number;
  readonly scores: Readonly<Record<string, number>>;
}

/**
 * Complete framework-agnostic game state.
 *
 * `abandonedPlayerIds` records every player that was declared abandoned and ended the
 * current round. `loserIds` then names the team(s) or player(s) that lost as a
 * consequence — in 2-player mode that is the abandoning player, in 4-player mode that
 * is the abandoning player's team.
 *
 * `roundOutcome` is the authoritative presentation result. `winnerIds`,
 * `abandonedPlayerIds`, and `loserIds` remain for migration and older UI paths.
 */
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
  readonly trumpExchangeUsed: boolean;
  readonly dealerSeatIndex: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly scoreHistory: readonly ScoreHistoryEntry[];
  readonly roundNumber: number;
  readonly deckSeed: number | null;
  readonly roundOutcome: RoundOutcome | null;
  readonly winnerIds: readonly string[];
  readonly abandonedPlayerIds: readonly string[];
  readonly loserIds: readonly string[];
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
