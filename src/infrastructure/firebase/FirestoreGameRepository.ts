import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  type Firestore,
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
import { GameStatus, GameVariant, type GameId } from '../../domain/game/Types';
import {
  GameStateMapper,
  type SerializedGameState,
  type SerializedMove,
  type SerializedPlayer,
} from '../mappers/GameStateMapper';
import { getFirebaseFirestore } from './firebaseApp';

type GameDocument = Omit<SerializedGameState, 'players'>;
type PlayerDocument = SerializedPlayer;
type MoveDocument = SerializedMove;

/** Firestore adapter using transactions for turn-sensitive updates. */
export class FirestoreGameRepository implements GameRepository {
  public constructor(private readonly db: Firestore = getFirebaseFirestore()) {}

  public async createGame(snapshot: GameState): Promise<void> {
    await this.writeState(snapshot);
  }

  public async getGame(gameId: GameId): Promise<GameState | null> {
    const gameSnapshot = await getDoc(this.gameRef(gameId));
    if (!gameSnapshot.exists()) {
      return null;
    }

    const gameDocument = gameSnapshot.data() as GameDocument;
    const players = await Promise.all(
      gameDocument.playerIds.map(async (playerId) => {
        const playerSnapshot = await getDoc(this.playerRef(gameId, playerId));
        return playerSnapshot.data() as PlayerDocument;
      }),
    );

    return this.fromDocuments(gameDocument, players.filter(Boolean));
  }

  public async listOpenGames(): Promise<readonly OpenGameSummary[]> {
    const snapshot = await getDocs(query(collection(this.db, 'games'), where('status', '==', GameStatus.Waiting)));
    const rooms = await Promise.all(
      snapshot.docs.map(async (gameSnapshot) => {
        const game = gameSnapshot.data() as GameDocument;
        const hostSnapshot = await getDoc(this.playerRef(game.gameId, game.hostPlayerId));
        const host = hostSnapshot.data() as PlayerDocument | undefined;

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
    await this.writeState(update.state, update.move);
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

      const gameDocument = gameSnapshot.data() as GameDocument;
      const playerDocuments: PlayerDocument[] = [];
      for (const playerId of gameDocument.playerIds) {
        const playerSnapshot = await transaction.get(this.playerRef(gameId, playerId));
        if (playerSnapshot.exists()) {
          playerDocuments.push(playerSnapshot.data() as PlayerDocument);
        }
      }

      const currentState = this.fromDocuments(gameDocument, playerDocuments);
      const update = await operation(currentState);
      const nextDocuments = this.toDocuments(update.state);

      transaction.set(this.gameRef(gameId), nextDocuments.game);
      nextDocuments.players.forEach((player) => {
        transaction.set(this.playerRef(gameId, player.id), player);
      });

      if (update.move) {
        transaction.set(this.moveRef(gameId, update.move.id), GameStateMapper.moveToData(update.move) as MoveDocument);
      }

      return update;
    });
  }

  public subscribe(gameId: GameId, onChange: (state: GameState | null) => void): () => void {
    return onSnapshot(this.gameRef(gameId), () => {
      void this.getGame(gameId).then(onChange).catch(() => onChange(null));
    });
  }

  private async writeState(state: GameState, move?: Move): Promise<void> {
    const documents = this.toDocuments(state);
    await setDoc(this.gameRef(state.gameId), documents.game);
    await Promise.all(documents.players.map((player) => setDoc(this.playerRef(state.gameId, player.id), player)));

    if (move) {
      await setDoc(this.moveRef(state.gameId, move.id), GameStateMapper.moveToData(move) as MoveDocument);
    }
  }

  private toDocuments(state: GameState): { game: GameDocument; players: readonly PlayerDocument[] } {
    const data = GameStateMapper.toData(state);
    const { players, ...game } = data;
    return { game, players };
  }

  private fromDocuments(game: GameDocument, players: readonly PlayerDocument[]): GameState {
    return GameStateMapper.fromData({ ...game, players });
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
}
