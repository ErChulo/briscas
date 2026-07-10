import { Card } from '../../domain/cards/Card';
import { Deck } from '../../domain/cards/Deck';
import { Hand } from '../../domain/cards/Hand';
import type { Rank } from '../../domain/cards/Rank';
import type { Suit } from '../../domain/cards/Suit';
import { InvalidGameStateError } from '../../domain/errors/DomainError';
import type { GameState, RoundOutcome, ScoreHistoryEntry } from '../../domain/game/GameState';
import type { Move, MoveType } from '../../domain/game/Move';
import { Player } from '../../domain/game/Player';
import { Trick } from '../../domain/game/Trick';
import { GameStatus, GameVariant } from '../../domain/game/Types';

const CURRENT_SCHEMA_VERSION = 1;

export interface SerializedCard {
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface SerializedPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly seatIndex: number;
  readonly hand: readonly SerializedCard[];
  /** Legacy field retained only for migration from pre-v1 snapshots. */
  readonly score?: number;
  readonly capturedTricks: number;
  readonly teamId: string | null;
  readonly connected: boolean;
  readonly lastSeenAt?: number;
  readonly abandonedAt?: number | null;
}

export interface SerializedTrick {
  readonly leadPlayerId: string | null;
  readonly plays: readonly { readonly playerId: string; readonly card: SerializedCard }[];
}

export interface SerializedDeck {
  readonly cards: readonly SerializedCard[];
  readonly trumpCard: SerializedCard | null;
}

export interface SerializedScoreHistoryEntry {
  readonly trickIndex: number;
  readonly scores: Readonly<Record<string, number>>;
}

export type SerializedRoundOutcome = RoundOutcome;

export interface SerializedGameState {
  readonly schemaVersion?: number;
  readonly gameId: string;
  readonly status: GameStatus;
  readonly variant: GameVariant;
  readonly hostPlayerId: string;
  readonly players: readonly SerializedPlayer[];
  readonly playerIds: readonly string[];
  readonly deck: SerializedDeck;
  readonly trumpSuit: Suit | null;
  readonly trumpCard: SerializedCard | null;
  readonly currentTrick: SerializedTrick;
  readonly lastCompletedTrick: SerializedTrick | null;
  readonly lastTrickWinnerId: string | null;
  readonly currentPlayerId: string | null;
  readonly trumpExchangeUsed: boolean;
  readonly dealerSeatIndex: number;
  readonly scores?: Readonly<Record<string, number>>;
  readonly scoreHistory?: readonly SerializedScoreHistoryEntry[];
  readonly roundNumber: number;
  readonly deckSeed: number | null;
  readonly deckCount: number;
  readonly roundOutcome?: SerializedRoundOutcome | null;
  readonly winnerIds?: readonly string[];
  readonly abandonedPlayerIds?: readonly string[];
  readonly loserIds?: readonly string[];
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SerializedMove {
  readonly id: string;
  readonly type: MoveType;
  readonly playerId: string;
  readonly card: SerializedCard | null;
  readonly createdAt: number;
  readonly resultingVersion: number | null;
}

type NormalizedSerializedGameState = Omit<SerializedGameState,
  'schemaVersion' | 'scores' | 'scoreHistory' | 'roundOutcome' | 'winnerIds' | 'abandonedPlayerIds' | 'loserIds'
> & {
  readonly schemaVersion: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly scoreHistory: readonly SerializedScoreHistoryEntry[];
  readonly roundOutcome: SerializedRoundOutcome | null;
  readonly winnerIds: readonly string[];
  readonly abandonedPlayerIds: readonly string[];
  readonly loserIds: readonly string[];
};

export class GameStateMapper {
  public static cardToData(card: Card): SerializedCard {
    return { suit: card.suit, rank: card.rank };
  }

  public static cardFromData(data: SerializedCard): Card {
    return new Card(data.suit, data.rank);
  }

  public static playerToData(player: Player): SerializedPlayer {
    return {
      id: player.id,
      displayName: player.displayName,
      seatIndex: player.seatIndex,
      hand: player.hand.toArray().map(GameStateMapper.cardToData),
      capturedTricks: player.capturedTricks,
      teamId: player.teamId,
      connected: player.connected,
      lastSeenAt: player.lastSeenAt,
      abandonedAt: player.abandonedAt,
    };
  }

  public static playerFromData(data: SerializedPlayer): Player {
    return new Player(
      data.id,
      data.displayName,
      data.seatIndex,
      new Hand(data.hand.map(GameStateMapper.cardFromData)),
      data.capturedTricks,
      data.teamId,
      data.connected,
      data.lastSeenAt ?? 0,
      data.abandonedAt ?? null,
    );
  }

  public static moveToData(move: Move): SerializedMove {
    return {
      id: move.id,
      type: move.type,
      playerId: move.playerId,
      card: move.card ? GameStateMapper.cardToData(move.card) : null,
      createdAt: move.createdAt,
      resultingVersion: move.resultingVersion ?? null,
    };
  }

  public static toData(state: GameState): SerializedGameState {
    const players = state.players.map(GameStateMapper.playerToData);
    const trumpCard = state.trumpCard ? GameStateMapper.cardToData(state.trumpCard) : null;

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gameId: state.gameId,
      status: state.status,
      variant: state.variant,
      hostPlayerId: state.hostPlayerId,
      players,
      playerIds: players.map((player) => player.id),
      deck: {
        cards: state.deck.toArray().map(GameStateMapper.cardToData),
        trumpCard,
      },
      trumpSuit: state.trumpCard?.suit ?? null,
      trumpCard,
      currentTrick: GameStateMapper.trickToData(state.currentTrick),
      lastCompletedTrick: state.lastCompletedTrick ? GameStateMapper.trickToData(state.lastCompletedTrick) : null,
      lastTrickWinnerId: state.lastTrickWinnerId,
      currentPlayerId: state.currentPlayerId,
      trumpExchangeUsed: state.trumpExchangeUsed,
      dealerSeatIndex: state.dealerSeatIndex,
      scores: state.scores,
      scoreHistory: state.scoreHistory.map(GameStateMapper.scoreHistoryToData),
      roundNumber: state.roundNumber,
      deckSeed: state.deckSeed,
      deckCount: state.deck.count,
      roundOutcome: state.roundOutcome,
      winnerIds: state.winnerIds,
      abandonedPlayerIds: state.abandonedPlayerIds,
      loserIds: state.loserIds,
      version: state.version,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  public static fromData(data: SerializedGameState): GameState {
    const migrated = GameStateMapper.migrate(data);
    const trumpCard = migrated.trumpCard ? GameStateMapper.cardFromData(migrated.trumpCard) : null;

    return {
      gameId: migrated.gameId,
      status: migrated.status,
      variant: migrated.variant,
      hostPlayerId: migrated.hostPlayerId,
      players: migrated.players.map(GameStateMapper.playerFromData),
      deck: new Deck(migrated.deck.cards.map(GameStateMapper.cardFromData), trumpCard),
      trumpCard,
      currentTrick: GameStateMapper.trickFromData(migrated.currentTrick),
      lastCompletedTrick: migrated.lastCompletedTrick ? GameStateMapper.trickFromData(migrated.lastCompletedTrick) : null,
      lastTrickWinnerId: migrated.lastTrickWinnerId,
      currentPlayerId: migrated.currentPlayerId,
      trumpExchangeUsed: migrated.trumpExchangeUsed,
      dealerSeatIndex: migrated.dealerSeatIndex,
      scores: migrated.scores,
      scoreHistory: migrated.scoreHistory.map(GameStateMapper.scoreHistoryFromData),
      roundNumber: migrated.roundNumber,
      deckSeed: migrated.deckSeed,
      roundOutcome: migrated.roundOutcome,
      winnerIds: migrated.winnerIds,
      abandonedPlayerIds: migrated.abandonedPlayerIds,
      loserIds: migrated.loserIds,
      version: migrated.version,
      createdAt: migrated.createdAt,
      updatedAt: migrated.updatedAt,
    };
  }

  private static migrate(data: SerializedGameState): NormalizedSerializedGameState {
    const schemaVersion = data.schemaVersion ?? 0;
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new InvalidGameStateError(`Unsupported game schema version: ${schemaVersion}`);
    }

    const scores = GameStateMapper.migrateScores(data);
    const winnerIds = data.winnerIds ?? [];
    const abandonedPlayerIds = data.abandonedPlayerIds ?? [];
    const loserIds = data.loserIds ?? [];
    const migrated: NormalizedSerializedGameState = {
      ...data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      trumpExchangeUsed: data.trumpExchangeUsed ?? false,
      scores,
      scoreHistory: data.scoreHistory ?? [],
      roundOutcome: data.roundOutcome ?? GameStateMapper.inferRoundOutcome(data.status, scores, winnerIds, abandonedPlayerIds),
      winnerIds,
      abandonedPlayerIds,
      loserIds,
    };

    GameStateMapper.validate(migrated);
    return migrated;
  }

  private static migrateScores(data: SerializedGameState): Readonly<Record<string, number>> {
    if (data.scores && Object.keys(data.scores).length > 0) {
      return data.scores;
    }

    return data.players.reduce<Record<string, number>>((scores, player) => {
      const ownerId = player.teamId ?? player.id;
      scores[ownerId] = (scores[ownerId] ?? 0) + (player.score ?? 0);
      return scores;
    }, {});
  }

  private static inferRoundOutcome(
    status: GameStatus,
    scores: Readonly<Record<string, number>>,
    winnerIds: readonly string[],
    abandonedPlayerIds: readonly string[],
  ): SerializedRoundOutcome | null {
    if (status !== GameStatus.Ended) {
      return null;
    }

    if (abandonedPlayerIds.length > 0) {
      return {
        type: 'abandonment',
        winnerOwnerIds: winnerIds,
        loserPlayerIds: abandonedPlayerIds,
      };
    }

    if (winnerIds.length === 1) {
      return { type: 'win', winnerOwnerIds: winnerIds };
    }

    const entries = Object.entries(scores);
    if (entries.length === 0) {
      return { type: 'draw' };
    }

    const highScore = Math.max(...entries.map(([, score]) => score));
    const highOwnerIds = entries.filter(([, score]) => score === highScore).map(([ownerId]) => ownerId);
    if (highOwnerIds.length === 1 && highScore > 60) {
      return { type: 'win', winnerOwnerIds: highOwnerIds };
    }

    return { type: 'draw' };
  }

  private static validate(data: NormalizedSerializedGameState): void {
    if (!data.gameId || !data.hostPlayerId) {
      throw new InvalidGameStateError('Persisted game is missing required identifiers.');
    }

    if (!Array.isArray(data.players) || data.players.length === 0) {
      throw new InvalidGameStateError('Persisted game has no players.');
    }

    const playerIds = new Set(data.players.map((player) => player.id));
    if (playerIds.size !== data.players.length) {
      throw new InvalidGameStateError('Persisted game contains duplicate players.');
    }

    if (data.currentPlayerId && !playerIds.has(data.currentPlayerId)) {
      throw new InvalidGameStateError('Persisted game current player does not exist.');
    }

    const playedByUnknownPlayer = data.currentTrick.plays.some((play) => !playerIds.has(play.playerId))
      || (data.lastCompletedTrick?.plays.some((play) => !playerIds.has(play.playerId)) ?? false);
    if (playedByUnknownPlayer) {
      throw new InvalidGameStateError('Persisted game contains a trick played by an unknown player.');
    }

    if (data.status === GameStatus.Playing && !data.currentPlayerId) {
      throw new InvalidGameStateError('Persisted active game has no current player.');
    }

    if (data.status !== GameStatus.Ended && data.roundOutcome !== null) {
      throw new InvalidGameStateError('Persisted unfinished game cannot have a round outcome.');
    }
  }

  private static trickToData(trick: Trick): SerializedTrick {
    return {
      leadPlayerId: trick.leadPlayerId,
      plays: trick.plays.map((play) => ({
        playerId: play.playerId,
        card: GameStateMapper.cardToData(play.card),
      })),
    };
  }

  private static scoreHistoryToData(entry: ScoreHistoryEntry): SerializedScoreHistoryEntry {
    return { trickIndex: entry.trickIndex, scores: entry.scores };
  }

  private static scoreHistoryFromData(entry: SerializedScoreHistoryEntry): ScoreHistoryEntry {
    return { trickIndex: entry.trickIndex, scores: entry.scores };
  }

  private static trickFromData(data: SerializedTrick): Trick {
    return new Trick(
      data.leadPlayerId,
      data.plays.map((play) => ({
        playerId: play.playerId,
        card: GameStateMapper.cardFromData(play.card),
      })),
    );
  }
}
