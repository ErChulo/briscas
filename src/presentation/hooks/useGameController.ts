import { useEffect, useRef, useState } from 'react';
import { CreateGameUseCase } from '../../application/use-cases/CreateGameUseCase';
import { JoinGameUseCase } from '../../application/use-cases/JoinGameUseCase';
import { PlayCardUseCase } from '../../application/use-cases/PlayCardUseCase';
import { ResetGameUseCase } from '../../application/use-cases/ResetGameUseCase';
import { StartGameUseCase } from '../../application/use-cases/StartGameUseCase';
import { SwapSevenUseCase } from '../../application/use-cases/SwapSevenUseCase';
import type { GameRepository, OpenGameSummary } from '../../application/ports/GameRepository';
import { SystemClock } from '../../application/services/Clock';
import { BrowserIdGenerator } from '../../application/services/IdGenerator';
import { Card } from '../../domain/cards/Card';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { GameStatus, GameVariant } from '../../domain/game/Types';
import type { TrumpSwapRank } from '../../domain/rules/RulesEngine';
import { BriscasRules } from '../../domain/rules/BriscasRules';
import { StandardTrickResolver } from '../../domain/rules/TrickResolver';
import { isFirebaseConfigured } from '../../infrastructure/config/firebaseConfig';
import { FirebaseAuthGateway } from '../../infrastructure/firebase/FirebaseAuthGateway';
import { FirestoreGameRepository } from '../../infrastructure/firebase/FirestoreGameRepository';
import { InMemoryGameRepository } from '../../infrastructure/repositories/InMemoryGameRepository';
import { SoundEffects } from '../audio/SoundEffects';

type Mode = 'menu' | 'local' | 'online';
const rules = new BriscasRules();
const trickResolver = new StandardTrickResolver();
const optimisticEngine = new GameEngine();
const ONLINE_ACTION_TIMEOUT_MS = 12_000;
const ONLINE_ACTION_TIMEOUT_MESSAGE = 'No se pudo conectar. Revisa la conexión e intenta otra vez.';

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
  const onlineUseCases = useRef<UseCases | null>(null);
  const sounds = useRef(new SoundEffects());
  const unsubscribe = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [state, setState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer>(() => loadLocalPlayer('Jugador'));
  const [viewPlayerId, setViewPlayerId] = useState(currentPlayer.id);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openGames, setOpenGames] = useState<readonly OpenGameSummary[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => loadSoundPreference());

  const firebaseConfigured = isFirebaseConfigured();

  useEffect(() => {
    sounds.current.setEnabled(soundEnabled);
    globalThis.localStorage?.setItem('briscas.soundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (!state?.lastCompletedTrick) {
      return;
    }

    sounds.current.play(state.status === GameStatus.Ended ? 'win' : 'capture');
  }, [state?.lastCompletedTrick, state?.status, state?.version]);

  useEffect(() => {
    function unlockOnInteraction() {
      sounds.current.unlock();
      document.removeEventListener('pointerdown', unlockOnInteraction);
    }

    document.addEventListener('pointerdown', unlockOnInteraction);
    return () => document.removeEventListener('pointerdown', unlockOnInteraction);
  }, []);

  useEffect(() => () => unsubscribe.current?.(), []);

  useEffect(() => {
    if (mode !== 'menu' || !firebaseConfigured) {
      return;
    }

    let cancelled = false;
    onlineRepository.current ??= new FirestoreGameRepository();
    const repository = onlineRepository.current;
    const auth = new FirebaseAuthGateway();

    async function load() {
      try {
        if (!auth.getCurrentPlayer()) {
          await auth.signInAnonymously(currentPlayer.displayName);
        }

        const rooms = await repository.listOpenGames();
        if (!cancelled) {
          setOpenGames(rooms);
        }
      } catch (error) {
        console.error('[load] Firestore error:', error);
        if (!cancelled) {
          setOpenGames([]);
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentPlayer.displayName, firebaseConfigured, mode]);

  useEffect(() => {
    if (mode !== 'local' || !state || state.status !== GameStatus.Playing || !state.currentPlayerId) {
      return;
    }

    if (!isBotPlayerId(state.currentPlayerId)) {
      return;
    }

    const botPlayerId = state.currentPlayerId;
    const cardId = chooseBotCardId(state, botPlayerId);
    if (!cardId) {
      return;
    }

    const delay = state.lastCompletedTrick ? 2300 : 650;
    const timer = window.setTimeout(() => {
      void localContext.useCases.playCard
        .execute({ gameId: state.gameId, playerId: botPlayerId, cardId })
        .then(() => sounds.current.play('play'))
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : 'La IA no pudo jugar.');
        });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [localContext.useCases.playCard, mode, state]);

  async function startLocal(displayName: string, variant: GameVariant) {
    unlockAudio();
    await run(async () => {
      const host = loadLocalPlayer(displayName);
      saveLocalPlayer(host);
      setCurrentPlayer(host);
      setViewPlayerId(host.id);
      const game = await localContext.useCases.createGame.execute({
        hostPlayerId: host.id,
        hostDisplayName: host.displayName,
        variant,
      });
      await subscribeTo(localContext.repository, game.gameId, game);

      const maxPlayers = variant === GameVariant.Standard4P ? 4 : 2;
      for (let index = 1; index < maxPlayers; index += 1) {
        await localContext.useCases.joinGame.execute({
          gameId: game.gameId,
          playerId: `bot-${index}`,
          displayName: maxPlayers === 2 ? 'IA' : `IA ${index}`,
        });
      }

      await localContext.useCases.startGame.execute({ gameId: game.gameId, playerId: host.id });
      setMode('local');
    });
  }

  async function createOnline(displayName: string, variant: GameVariant) {
    unlockAudio();
    await run(async () => {
      if (!firebaseConfigured) {
        throw new Error('El modo online no está configurado.');
      }

      const auth = new FirebaseAuthGateway();
      const player = await withOnlineTimeout(auth.signInAnonymously(displayName));
      const repository = getOnlineRepository();
      const useCases = getOnlineUseCases();
      const game = await withOnlineTimeout(useCases.createGame.execute({
        hostPlayerId: player.uid,
        hostDisplayName: player.displayName,
        variant,
      }));

      setCurrentPlayer({ id: player.uid, displayName: player.displayName });
      setViewPlayerId(player.uid);
      setMode('online');
      setOpenGames([]);
      await subscribeTo(repository, game.gameId, game);
    });
  }

  async function joinOnline(displayName: string, gameId: string) {
    unlockAudio();
    await run(async () => {
      if (!firebaseConfigured) {
        throw new Error('El modo online no está configurado.');
      }

      const auth = new FirebaseAuthGateway();
      const player = await withOnlineTimeout(auth.signInAnonymously(displayName));
      const repository = getOnlineRepository();
      const useCases = getOnlineUseCases();
      const game = await withOnlineTimeout(
        useCases.joinGame.execute({ gameId, playerId: player.uid, displayName: player.displayName }),
      );

      setCurrentPlayer({ id: player.uid, displayName: player.displayName });
      setViewPlayerId(player.uid);
      setMode('online');
      setOpenGames([]);
      await subscribeTo(repository, game.gameId, game);
    });
  }

  async function startGame() {
    unlockAudio();
    const gameState = requireState();
    await run(async () => {
      const nextState = await withActiveOnlineTimeout(
        activeUseCases().startGame.execute({ gameId: gameState.gameId, playerId: currentPlayer.id }),
      );
      setState(nextState);
    });
  }

  async function playCard(cardId: string) {
    unlockAudio();
    const gameState = requireState();
    const playerId = currentPlayer.id;
    sounds.current.play('play');
    await run(async () => {
      const optimisticState = mode === 'online' ? optimisticPlayCard(gameState, playerId, cardId) : null;
      if (optimisticState) {
        setState(optimisticState);
      }

      try {
        const nextState = await withActiveOnlineTimeout(
          activeUseCases().playCard.execute(
            { gameId: gameState.gameId, playerId, cardId },
            optimisticState ?? undefined,
          ),
        );
        setState(nextState);
      } catch (error) {
        if (optimisticState) {
          setState(gameState);
        }
        throw error;
      }
    });
  }

  function toggleSound() {
    unlockAudio();
    setSoundEnabled((enabled) => !enabled);
  }

  async function swapSeven(exchangeRank: TrumpSwapRank = 7) {
    unlockAudio();
    const gameState = requireState();
    const playerId = currentPlayer.id;
    await run(async () => {
      const nextState = await withActiveOnlineTimeout(
        activeUseCases().swapSeven.execute({ gameId: gameState.gameId, playerId, exchangeRank }),
      );
      setState(nextState);
    });
  }

  async function resetGame() {
    unlockAudio();
    const gameState = requireState();
    const playerId = currentPlayer.id;
    await run(async () => {
      const nextState = await withActiveOnlineTimeout(
        activeUseCases().resetGame.execute({ gameId: gameState.gameId, playerId }),
      );
      setState(nextState);
    });
  }

  function leaveGame() {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setState(null);
    setMode('menu');
    setMessage(null);
  }

  async function subscribeTo(repository: GameRepository, gameId: string, initialState?: GameState) {
    unsubscribe.current?.();
    unsubscribe.current = repository.subscribe(gameId, setState);
    if (initialState) {
      setState(initialState);
      return;
    }

    const snapshot = await repository.getGame(gameId);
    setState(snapshot);
  }

  function activeUseCases(): UseCases {
    return mode === 'online' ? getOnlineUseCases() : localContext.useCases;
  }

  function withActiveOnlineTimeout<T>(promise: Promise<T>): Promise<T> {
    return mode === 'online' ? withOnlineTimeout(promise) : promise;
  }

  function getOnlineRepository(): GameRepository {
    onlineRepository.current ??= new FirestoreGameRepository();
    return onlineRepository.current;
  }

  function getOnlineUseCases(): UseCases {
    onlineUseCases.current ??= makeUseCases(getOnlineRepository());
    return onlineUseCases.current;
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
      console.error('[run] Action error:', error);
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.');
    } finally {
      setBusy(false);
    }
  }

  function unlockAudio() {
    sounds.current.unlock();
  }

  return {
    mode,
    state,
    currentPlayer,
    viewPlayerId,
    message,
    busy,
    openGames,
    soundEnabled,
    firebaseConfigured,
    createOnline,
    joinOnline,
    startLocal,
    startGame,
    playCard,
    toggleSound,
    swapSeven,
    resetGame,
    leaveGame,
    setViewPlayerId,
  };
}

function isBotPlayerId(playerId: string): boolean {
  return playerId.startsWith('bot-');
}

function chooseBotCardId(state: GameState, botPlayerId: string): string | null {
  const bot = state.players.find((player) => player.id === botPlayerId);
  if (!bot) {
    return null;
  }

  const validCards = bot.hand.toArray().filter((card) => rules.canPlayCard(state, botPlayerId, card).valid);
  if (validCards.length === 0) {
    return null;
  }

  const trumpSuit = state.trumpCard?.suit;
  const trickHasPoints = state.currentTrick.plays.some((play) => play.card.pointValue > 0);

  if (trumpSuit && !state.currentTrick.isEmpty) {
    const winningCards = validCards.filter((card) =>
      trickResolver.resolveWinner(state.currentTrick.addPlay(botPlayerId, card), trumpSuit) === botPlayerId,
    );

    if (winningCards.length > 0 && trickHasPoints) {
      return sortConservative(winningCards)[0].id;
    }
  }

  return sortConservative(validCards)[0].id;
}

function sortConservative(cards: readonly Card[]): readonly Card[] {
  return [...cards].sort((left, right) => {
    if (left.pointValue !== right.pointValue) {
      return left.pointValue - right.pointValue;
    }

    return right.captureStrength - left.captureStrength;
  });
}

function optimisticPlayCard(state: GameState, playerId: string, cardId: string): GameState | null {
  try {
    return optimisticEngine.playCard(state, playerId, Card.fromId(cardId), Date.now());
  } catch {
    return null;
  }
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

function loadSoundPreference(): boolean {
  return globalThis.localStorage?.getItem('briscas.soundEnabled') !== 'false';
}

function withOnlineTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error(ONLINE_ACTION_TIMEOUT_MESSAGE)), ONLINE_ACTION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
  });
}
