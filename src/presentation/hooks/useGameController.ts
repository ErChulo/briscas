import { useEffect, useRef, useState } from 'react';
import { CreateGameUseCase } from '../../application/use-cases/CreateGameUseCase';
import { JoinGameUseCase } from '../../application/use-cases/JoinGameUseCase';
import { PlayCardUseCase } from '../../application/use-cases/PlayCardUseCase';
import { ResetGameUseCase } from '../../application/use-cases/ResetGameUseCase';
import { StartGameUseCase } from '../../application/use-cases/StartGameUseCase';
import { SwapSevenUseCase } from '../../application/use-cases/SwapSevenUseCase';
import type { GameRepository } from '../../application/ports/GameRepository';
import { SystemClock } from '../../application/services/Clock';
import { BrowserIdGenerator } from '../../application/services/IdGenerator';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { GameStatus, GameVariant } from '../../domain/game/Types';
import { isFirebaseConfigured } from '../../infrastructure/config/firebaseConfig';
import { FirebaseAuthGateway } from '../../infrastructure/firebase/FirebaseAuthGateway';
import { FirestoreGameRepository } from '../../infrastructure/firebase/FirestoreGameRepository';
import { InMemoryGameRepository } from '../../infrastructure/repositories/InMemoryGameRepository';

type Mode = 'menu' | 'local' | 'online';

interface CurrentPlayer {
  readonly id: string;
  readonly displayName: string;
}

interface UseCases {
  readonly createGame: CreateGameUseCase;
  readonly joinGame: JoinGameUseCase;
  readonly startGame: StartGameUseCase;
  readonly playCard: PlayCardUseCase;
  readonly swapSeven: SwapSevenUseCase;
  readonly resetGame: ResetGameUseCase;
}

export function useGameController() {
  const [localContext] = useState(() => {
    const repository = new InMemoryGameRepository();
    return { repository, useCases: makeUseCases(repository) };
  });
  const onlineRepository = useRef<GameRepository | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [state, setState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer>(() => loadLocalPlayer('Jugador'));
  const [viewPlayerId, setViewPlayerId] = useState(currentPlayer.id);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firebaseConfigured = isFirebaseConfigured();
  const activeViewPlayerId = mode === 'local' && state?.status === GameStatus.Playing && state.currentPlayerId
    ? state.currentPlayerId
    : viewPlayerId;

  useEffect(() => () => unsubscribe.current?.(), []);

  async function startLocal(displayName: string, variant: GameVariant) {
    await run(async () => {
      const host = loadLocalPlayer(displayName);
      saveLocalPlayer(host);
      setCurrentPlayer(host);
      const game = await localContext.useCases.createGame.execute({
        hostPlayerId: host.id,
        hostDisplayName: host.displayName,
        variant,
      });
      await subscribeTo(localContext.repository, game.gameId);

      const maxPlayers = variant === GameVariant.Standard4P ? 4 : 2;
      for (let index = 1; index < maxPlayers; index += 1) {
        await localContext.useCases.joinGame.execute({
          gameId: game.gameId,
          playerId: `local-${index}`,
          displayName: maxPlayers === 2 ? 'Invitado local' : `Jugador ${index + 1}`,
        });
      }

      await localContext.useCases.startGame.execute({ gameId: game.gameId, playerId: host.id });
      setMode('local');
    });
  }

  async function createOnline(displayName: string, variant: GameVariant) {
    await run(async () => {
      if (!firebaseConfigured) {
        throw new Error('Firebase no está configurado.');
      }

      const auth = new FirebaseAuthGateway();
      const player = await auth.signInAnonymously(displayName);
      const repository = getOnlineRepository();
      const useCases = makeUseCases(repository);
      const game = await useCases.createGame.execute({
        hostPlayerId: player.uid,
        hostDisplayName: player.displayName,
        variant,
      });

      setCurrentPlayer({ id: player.uid, displayName: player.displayName });
      setViewPlayerId(player.uid);
      setMode('online');
      await subscribeTo(repository, game.gameId);
    });
  }

  async function joinOnline(displayName: string, gameId: string) {
    await run(async () => {
      if (!firebaseConfigured) {
        throw new Error('Firebase no está configurado.');
      }

      const auth = new FirebaseAuthGateway();
      const player = await auth.signInAnonymously(displayName);
      const repository = getOnlineRepository();
      const useCases = makeUseCases(repository);
      const game = await useCases.joinGame.execute({ gameId, playerId: player.uid, displayName: player.displayName });

      setCurrentPlayer({ id: player.uid, displayName: player.displayName });
      setViewPlayerId(player.uid);
      setMode('online');
      await subscribeTo(repository, game.gameId);
    });
  }

  async function startGame() {
    const gameState = requireState();
    await run(async () => {
      await activeUseCases().startGame.execute({ gameId: gameState.gameId, playerId: currentPlayer.id });
    });
  }

  async function playCard(cardId: string) {
    const gameState = requireState();
    const playerId = mode === 'local' ? activeViewPlayerId : currentPlayer.id;
    await run(async () => {
      await activeUseCases().playCard.execute({ gameId: gameState.gameId, playerId, cardId });
    });
  }

  async function swapSeven() {
    const gameState = requireState();
    const playerId = mode === 'local' ? activeViewPlayerId : currentPlayer.id;
    await run(async () => {
      await activeUseCases().swapSeven.execute({ gameId: gameState.gameId, playerId });
    });
  }

  async function resetGame() {
    const gameState = requireState();
    const playerId = mode === 'local' ? activeViewPlayerId : currentPlayer.id;
    await run(async () => {
      await activeUseCases().resetGame.execute({ gameId: gameState.gameId, playerId });
    });
  }

  function leaveGame() {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setState(null);
    setMode('menu');
    setMessage(null);
  }

  async function subscribeTo(repository: GameRepository, gameId: string) {
    unsubscribe.current?.();
    unsubscribe.current = repository.subscribe(gameId, setState);
    const snapshot = await repository.getGame(gameId);
    setState(snapshot);
  }

  function activeUseCases(): UseCases {
    return mode === 'online' ? makeUseCases(getOnlineRepository()) : localContext.useCases;
  }

  function getOnlineRepository(): GameRepository {
    onlineRepository.current ??= new FirestoreGameRepository();
    return onlineRepository.current;
  }

  function requireState(): GameState {
    if (!state) {
      throw new Error('No hay partida activa.');
    }

    return state;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.');
    } finally {
      setBusy(false);
    }
  }

  return {
    mode,
    state,
    currentPlayer,
    viewPlayerId: activeViewPlayerId,
    message,
    busy,
    firebaseConfigured,
    createOnline,
    joinOnline,
    startLocal,
    startGame,
    playCard,
    swapSeven,
    resetGame,
    leaveGame,
    setViewPlayerId,
  };
}

function makeUseCases(repository: GameRepository): UseCases {
  const engine = new GameEngine();
  const ids = new BrowserIdGenerator();
  const clock = new SystemClock();

  return {
    createGame: new CreateGameUseCase(repository, engine, ids, clock),
    joinGame: new JoinGameUseCase(repository, engine, ids, clock),
    startGame: new StartGameUseCase(repository, engine, ids, clock),
    playCard: new PlayCardUseCase(repository, engine, ids, clock),
    swapSeven: new SwapSevenUseCase(repository, engine, ids, clock),
    resetGame: new ResetGameUseCase(repository, engine, ids, clock),
  };
}

function loadLocalPlayer(displayName: string): CurrentPlayer {
  const stored = globalThis.localStorage?.getItem('briscas.localPlayer');
  if (stored) {
    const parsed = JSON.parse(stored) as CurrentPlayer;
    return { ...parsed, displayName: displayName.trim() || parsed.displayName };
  }

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`,
    displayName: displayName.trim() || 'Jugador',
  };
}

function saveLocalPlayer(player: CurrentPlayer): void {
  globalThis.localStorage?.setItem('briscas.localPlayer', JSON.stringify(player));
}
