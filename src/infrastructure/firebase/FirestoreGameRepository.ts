import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import type {
  GameRepository,
  GameTransaction,
  OpenGameSummary,
  PersistedGameUpdate,
} from '../../application/ports/GameRepository';
import { GameNotFoundError } from '../../domain/errors/DomainError';
import type { GameState } from '../../domain/game/GameState';
import type { Move } from '../../domain/game/Move';
import { MoveType } from '../../domain/game/Move';
import { GameStatus, GameVariant, type GameId } from '../../domain/game/Types';
import {
  GameStateMapper,
  type SerializedGameState,
  type SerializedMove,
  type SerializedPlayer,
} from '../mappers/GameStateMapper';
import { getFirebaseFirestore } from './firebaseApp';

type GameDocument = Omit<SerializedGameState, 'players'>;
type StoredGameDocument = GameDocument & { readonly players?: readonly PlayerDocument[] };
type PlayerDocument = SerializedPlayer;
type MoveDocument = SerializedMove;

/** Firestore adapter using transactions for turn-sensitive updates. */
export class FirestoreGameRepository implements GameRepository {
  public constructor(private readonly db: Firestore = getFirebaseFirestore()) {}

  public async createGame(snapshot: GameState): Promise<void> {
    await this.writeState(snapshot, undefined, true);
  }

  public async getGame(gameId: GameId): Promise<GameState | null> {
    const gameSnapshot = await getDoc(this.gameRef(gameId));
    if (!gameSnapshot.exists()) {
      return null;
    }

    const gameDocument = gameSnapshot.data() as StoredGameDocument;
    if (this.hasEmbeddedPlayers(gameDocument)) {
      return GameStateMapper.fromData(gameDocument as SerializedGameState);
    }

    const players = await this.getPlayerDocuments(gameId, gameDocument.playerIds);

    return this.fromDocuments(gameDocument, players.filter(Boolean));
  }

  public async listOpenGames(): Promise<readonly OpenGameSummary[]> {
    const snapshot = await getDocs(query(collection(this.db, 'games'), where('status', '==', GameStatus.Waiting)));
    const rooms = await Promise.all(
      snapshot.docs.map(async (gameSnapshot) => {
        const game = gameSnapshot.data() as StoredGameDocument;
        const embeddedHost = game.players?.find((player) => player.id === game.hostPlayerId);
        const host = embeddedHost
          ?? ((await getDoc(this.playerRef(game.gameId, game.hostPlayerId))).data() as PlayerDocument | undefined);

        return {
          gameId: game.gameId,
          hostDisplayName: host?.displayName ?? 'Jugador',
          variant: game.variant,
          playerCount: game.playerIds.length,
          maxPlayers: game.variant === GameVariant.Standard4P ? 4 : 2,
          createdAt: game.createdAt,
        } satisfies OpenGameSummary;
      }),
    );

    return rooms
      .filter((room) => room.playerCount < room.maxPlayers)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 12);
  }

  public async updateGame(update: PersistedGameUpdate): Promise<void> {
    await this.writeState(update.state, update.move, false);
  }

  public async runTransaction<T extends PersistedGameUpdate>(
    gameId: GameId,
    operation: GameTransaction<T>,
  ): Promise<T> {
    return runTransaction(this.db, async (transaction) => {
      const gameSnapshot = await transaction.get(this.gameRef(gameId));
      if (!gameSnapshot.exists()) {
        throw new GameNotFoundError('No se encontró la sala.');
      }

      const gameDocument = gameSnapshot.data() as StoredGameDocument;
      const currentState = this.hasEmbeddedPlayers(gameDocument)
        ? GameStateMapper.fromData(gameDocument as SerializedGameState)
        : this.fromDocuments(gameDocument, await this.getPlayerDocumentsInTransaction(transaction, gameId, gameDocument.playerIds));
      const update = await operation(currentState);
      const nextDocuments = this.toDocuments(update.state);
      const previousPlayerIds = new Set(currentState.players.map((player) => player.id));

      transaction.set(this.gameRef(gameId), nextDocuments.game);
      nextDocuments.players.forEach((player) => {
        if (!previousPlayerIds.has(player.id)) {
          transaction.set(this.playerRef(gameId, player.id), player);
        }
      });

      if (update.move && this.shouldWriteMove(update.move.type)) {
        transaction.set(this.moveRef(gameId, update.move.id), GameStateMapper.moveToData(update.move) as MoveDocument);
      }

      return update;
    });
  }

  public subscribe(gameId: GameId, onChange: (state: GameState | null) => void): () => void {
    void getDocFromCache(this.gameRef(gameId))
      .then((cached) => {
        if (cached.exists()) {
          const gameDocument = cached.data() as StoredGameDocument;
          if (this.hasEmbeddedPlayers(gameDocument)) {
            onChange(GameStateMapper.fromData(gameDocument as SerializedGameState));
          }
        }
      })
      .catch(() => undefined);

    return onSnapshot(this.gameRef(gameId), (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }

      const gameDocument = snapshot.data() as StoredGameDocument;
      if (this.hasEmbeddedPlayers(gameDocument)) {
        onChange(GameStateMapper.fromData(gameDocument as SerializedGameState));
        return;
      }

      void this.getPlayerDocuments(gameId, gameDocument.playerIds)
        .then((players) => onChange(this.fromDocuments(gameDocument, players.filter(Boolean))))
        .catch(() => onChange(null));
    });
  }

  private async writeState(state: GameState, move?: Move, writePlayers = false): Promise<void> {
    const documents = this.toDocuments(state);
    await setDoc(this.gameRef(state.gameId), documents.game);

    if (writePlayers) {
      await Promise.all(documents.players.map((player) => setDoc(this.playerRef(state.gameId, player.id), player)));
    }

    if (move && this.shouldWriteMove(move.type)) {
      await setDoc(this.moveRef(state.gameId, move.id), GameStateMapper.moveToData(move) as MoveDocument);
    }
  }

  private toDocuments(state: GameState): { game: SerializedGameState; players: readonly PlayerDocument[] } {
    const data = GameStateMapper.toData(state);
    return { game: data, players: data.players };
  }

  private fromDocuments(game: StoredGameDocument, players: readonly PlayerDocument[]): GameState {
    return GameStateMapper.fromData({ ...game, players } as SerializedGameState);
  }

  private hasEmbeddedPlayers(game: StoredGameDocument): boolean {
    return Array.isArray(game.players)
      && game.playerIds.every((playerId) => game.players?.some((player) => player.id === playerId));
  }

  private async getPlayerDocuments(gameId: GameId, playerIds: readonly string[]): Promise<readonly PlayerDocument[]> {
    const players = await Promise.all(
      playerIds.map(async (playerId) => {
        const playerSnapshot = await getDoc(this.playerRef(gameId, playerId));
        return playerSnapshot.data() as PlayerDocument | undefined;
      }),
    );

    return players.filter((player): player is PlayerDocument => Boolean(player));
  }

  private async getPlayerDocumentsInTransaction(
    transaction: Transaction,
    gameId: GameId,
    playerIds: readonly string[],
  ): Promise<readonly PlayerDocument[]> {
    const players: PlayerDocument[] = [];
    for (const playerId of playerIds) {
      const playerSnapshot = await transaction.get(this.playerRef(gameId, playerId));
      if (playerSnapshot.exists()) {
        players.push(playerSnapshot.data() as PlayerDocument);
      }
    }

    return players;
  }

  private gameRef(gameId: GameId) {
    return doc(collection(this.db, 'games'), gameId);
  }

  private playerRef(gameId: GameId, playerId: string) {
    return doc(collection(this.gameRef(gameId), 'players'), playerId);
  }

  private moveRef(gameId: GameId, moveId: string) {
    return doc(collection(this.gameRef(gameId), 'moves'), moveId);
  }

  private shouldWriteMove(type: MoveType): boolean {
    return type === MoveType.CreateGame
      || type === MoveType.JoinGame
      || type === MoveType.StartGame
      || type === MoveType.ResetGame;
  }
}
