import { Card } from '../../domain/cards/Card';
import { Deck } from '../../domain/cards/Deck';
import { Hand } from '../../domain/cards/Hand';
import type { Rank } from '../../domain/cards/Rank';
import type { Suit } from '../../domain/cards/Suit';
import type { GameState } from '../../domain/game/GameState';
import type { Move, MoveType } from '../../domain/game/Move';
import { Player } from '../../domain/game/Player';
import { Trick } from '../../domain/game/Trick';
import { GameStatus, GameVariant } from '../../domain/game/Types';

export interface SerializedCard {
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface SerializedPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly seatIndex: number;
  readonly hand: readonly SerializedCard[];
  readonly score: number;
  readonly capturedTricks: number;
  readonly teamId: string | null;
  readonly connected: boolean;
}

export interface SerializedTrick {
  readonly leadPlayerId: string | null;
  readonly plays: readonly { readonly playerId: string; readonly card: SerializedCard }[];
}

export interface SerializedDeck {
  readonly cards: readonly SerializedCard[];
  readonly trumpCard: SerializedCard | null;
}

export interface SerializedGameState {
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
  readonly currentPlayerId: string | null;
  readonly dealerSeatIndex: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly roundNumber: number;
  readonly deckSeed: number | null;
  readonly deckCount: number;
  readonly winnerIds: readonly string[];
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
      score: player.score,
      capturedTricks: player.capturedTricks,
      teamId: player.teamId,
      connected: player.connected,
    };
  }

  public static playerFromData(data: SerializedPlayer): Player {
    return new Player(
      data.id,
      data.displayName,
      data.seatIndex,
      new Hand(data.hand.map(GameStateMapper.cardFromData)),
      data.score,
      data.capturedTricks,
      data.teamId,
      data.connected,
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
      currentTrick: {
        leadPlayerId: state.currentTrick.leadPlayerId,
        plays: state.currentTrick.plays.map((play) => ({
          playerId: play.playerId,
          card: GameStateMapper.cardToData(play.card),
        })),
      },
      currentPlayerId: state.currentPlayerId,
      dealerSeatIndex: state.dealerSeatIndex,
      scores: state.scores,
      roundNumber: state.roundNumber,
      deckSeed: state.deckSeed,
      deckCount: state.deck.count,
      winnerIds: state.winnerIds,
      version: state.version,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  public static fromData(data: SerializedGameState): GameState {
    const trumpCard = data.trumpCard ? GameStateMapper.cardFromData(data.trumpCard) : null;

    return {
      gameId: data.gameId,
      status: data.status,
      variant: data.variant,
      hostPlayerId: data.hostPlayerId,
      players: data.players.map(GameStateMapper.playerFromData),
      deck: new Deck(data.deck.cards.map(GameStateMapper.cardFromData), trumpCard),
      trumpCard,
      currentTrick: new Trick(
        data.currentTrick.leadPlayerId,
        data.currentTrick.plays.map((play) => ({
          playerId: play.playerId,
          card: GameStateMapper.cardFromData(play.card),
        })),
      ),
      currentPlayerId: data.currentPlayerId,
      dealerSeatIndex: data.dealerSeatIndex,
      scores: data.scores,
      roundNumber: data.roundNumber,
      deckSeed: data.deckSeed,
      winnerIds: data.winnerIds,
      version: data.version,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
