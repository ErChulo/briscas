import { useEffect, useRef, useState } from 'react';
import { CreateGameUseCase } from '../../application/use-cases/CreateGameUseCase';
import { JoinGameUseCase } from '../../application/use-cases/JoinGameUseCase';
import { PlayCardUseCase } from '../../application/use-cases/PlayCardUseCase';
import { ResetGameUseCase } from '../../application/use-cases/ResetGameUseCase';
import { StartGameUseCase } from '../../application/use-cases/StartGameUseCase';
import { SwapSevenUseCase } from '../../application/use-cases/SwapSevenUseCase';
import { HeartbeatUseCase } from '../../application/use-cases/HeartbeatUseCase';
import { MarkPlayerAbandonedUseCase } from '../../application/use-cases/MarkPlayerAbandonedUseCase';
import {
  ABANDONMENT_GRACE_MS,
  HEARTBEAT_INTERVAL_MS,
} from '../../application/onlineConfig';
import type { GameRepository, OpenGameSummary } from '../../application/ports/GameRepository';
import { SystemClock } from '../../application/services/Clock';
import { BrowserIdGenerator } from '../../application/services/IdGenerator';
import { Card } from '../../domain/cards/Card';
import { GameEngine } from '../../domain/game/GameEngine';
import type { GameState } from '../../domain/game/GameState';
import { Player } from '../../domain/game/Player';
import { Trick } from '../../domain/game/Trick';
import { GameStatus, GameVariant } from '../../domain/game/Types';
import type { PlayerId } from '../../domain/game/Types';
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
const BOT_FIRST_TRICK_THINK_MS = 500;
const BOT_AFTER_COMPLETED_TRICK_THINK_MS = 3000;
const E2E_LONG_PLAYER_NAMES = [
  'Norte Con Nombre Largo',
  'Este Con Nombre Largo',
  'Sur Con Nombre Largo',
  'Oeste Con Nombre Largo',
] as const;

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
  readonly heartbeat: HeartbeatUseCase;
  readonly markAbandoned: MarkPlayerAbandonedUseCase;
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
    if (!import.meta.env.DEV) {
      return;
    }

    function endCurrentGameForE2E(event: Event) {
      const requestedMode = (event as CustomEvent<{ readonly mode?: Mode }>).detail?.mode;
      if (requestedMode === 'local' || requestedMode === 'online') {
        setMode(requestedMode);
      }

      setState((current) => {
        if (!current) {
          return current;
        }

        const ownerIds = Object.keys(current.scores);
        if (ownerIds.length === 0) {
          return current;
        }

        const zeroScores = ownerIds.reduce<Record<string, number>>((scores, ownerId) => {
          scores[ownerId] = 0;
          return scores;
        }, {});
        const finalScores = ownerIds.reduce<Record<string, number>>((scores, ownerId, index) => {
          scores[ownerId] = index === 0 ? 63 : index === 1 ? 57 : 0;
          return scores;
        }, {});
        const firstOwner = ownerIds[0];
        const secondOwner = ownerIds[1] ?? ownerIds[0];

        return {
          ...current,
          status: GameStatus.Ended,
          currentPlayerId: null,
          winnerIds: [firstOwner],
          roundOutcome: { type: 'win', winnerOwnerIds: [firstOwner] },
          scores: finalScores,
          scoreHistory: [
            { trickIndex: 0, scores: zeroScores },
            { trickIndex: 1, scores: { ...zeroScores, [firstOwner]: 11 } },
            { trickIndex: 2, scores: { ...zeroScores, [firstOwner]: 11, [secondOwner]: 13 } },
            { trickIndex: 3, scores: { ...zeroScores, [firstOwner]: 37, [secondOwner]: 13 } },
            { trickIndex: 4, scores: finalScores },
          ],
          updatedAt: Date.now(),
          version: current.version + 1,
        };
      });
    }

    function showTrickForE2E(event: Event) {
      const detail = (event as CustomEvent<{ readonly completed?: boolean; readonly longNames?: boolean }>).detail;
      setState((current) => {
        if (!current) {
          return current;
        }

        const players = detail?.longNames
          ? current.players.map((player, index) => new Player(
              player.id,
              E2E_LONG_PLAYER_NAMES[index] ?? `${player.displayName} Largo`,
              player.seatIndex,
              player.hand,
              player.capturedTricks,
              player.teamId,
              player.connected,
              player.lastSeenAt,
              player.abandonedAt,
            ))
          : current.players;
        const fallbackCardIds = ['oro-1', 'copa-3', 'espada-12', 'basto-7'] as const;
        const plays = [...players]
          .sort((a, b) => a.seatIndex - b.seatIndex)
          .map((player, index) => ({
            playerId: player.id,
            card: player.hand.toArray()[0] ?? Card.fromId(fallbackCardIds[index % fallbackCardIds.length]),
          }));
        const trick = new Trick(plays[0]?.playerId ?? null, plays);
        const winnerId = plays[0]?.playerId ?? current.currentPlayerId;

        return {
          ...current,
          players,
          currentTrick: detail?.completed ? new Trick(null, []) : trick,
          lastCompletedTrick: detail?.completed ? trick : null,
          lastTrickWinnerId: detail?.completed ? winnerId : null,
          updatedAt: Date.now(),
          version: current.version + 1,
        };
      });
    }

    window.addEventListener('briscas:e2e:end-game', endCurrentGameForE2E);
    window.addEventListener('briscas:e2e:show-trick', showTrickForE2E);
    return () => {
      window.removeEventListener('briscas:e2e:end-game', endCurrentGameForE2E);
      window.removeEventListener('briscas:e2e:show-trick', showTrickForE2E);
    };
  }, []);

  useEffect(() => {
    sounds.current.setEnabled(soundEnabled);
    try {
      globalThis.localStorage?.setItem('briscas.soundEnabled', String(soundEnabled));
    } catch {
      // Storage is best-effort; sound still updates for this session.
    }
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

  const getOnlineRepository = (): GameRepository => {
    onlineRepository.current ??= new FirestoreGameRepository();
    return onlineRepository.current;
  };

  const getOnlineUseCases = (): UseCases => {
    onlineUseCases.current ??= makeUseCases(getOnlineRepository());
    return onlineUseCases.current;
  };

  const activeUseCases = (): UseCases => (mode === 'online' ? getOnlineUseCases() : localContext.useCases);

  const withActiveOnlineTimeout = <T>(promise: Promise<T>): Promise<T> =>
    mode === 'online' ? withOnlineTimeout(promise) : promise;

  // Online-mode heartbeat: bump our own lastSeenAt every HEARTBEAT_INTERVAL_MS so
  // other participants can detect a silent drop. Runs only while we are an active
  // player inside a started game; offline / local play skips it entirely.
  const activeGameId = mode === 'online' && state?.status === GameStatus.Playing ? state.gameId : null;
  useEffect(() => {
    if (!activeGameId) {
      return;
    }

    const useCases = getOnlineUseCases();
    const gameId = activeGameId;
    const playerId: PlayerId = currentPlayer.id;
    const timer = window.setInterval(() => {
      void useCases.heartbeat.execute({ gameId, playerId }).catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(timer);
    // `getOnlineUseCases` is a stable const arrow function that returns a
    // cached value; intentionally omitted from deps to avoid resetting the
    // interval on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGameId, currentPlayer.id]);

  // Online-mode abandonment detection: on every snapshot, scan the player list
  // and pick the stalest participant. If anyone is past the grace window and the
  // game is still playing, declare them abandoned through a transaction so the
  // race resolves safely even if two clients spot the drop simultaneously.
  useEffect(() => {
    if (mode !== 'online' || !state || state.status !== GameStatus.Playing) {
      return;
    }

    const useCases = getOnlineUseCases();
    const now = Date.now();
    const stale = state.players
      .filter((player) => player.id !== currentPlayer.id && player.abandonedAt === null)
      .filter((player) => player.isStale(now, ABANDONMENT_GRACE_MS));
    if (stale.length === 0) {
      return;
    }

    const target = stale.reduce((left, right) =>
      left.lastSeenAt - right.lastSeenAt < 0 ? left : right,
    );

    void useCases.markAbandoned
      .execute({ gameId: state.gameId, playerId: target.id, reportedBy: currentPlayer.id })
      .catch(() => undefined);
    // `getOnlineUseCases` is a stable const arrow function that returns a
    // cached value; intentionally omitted from deps so the detection scan
    // runs only when status/version/player identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer.id, mode, state]);

  useEffect(() => {
    if (mode !== 'menu' || !firebaseConfigured || shouldSkipOpenGamePolling()) {
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

    // Give the completed trick UI time to hold and collect before the bot starts the next trick.
    const delay = state.lastCompletedTrick ? BOT_AFTER_COMPLETED_TRICK_THINK_MS : BOT_FIRST_TRICK_THINK_MS;
    const timer = window.setTimeout(() => {
      void localContext.useCases.playCard
        .execute({ gameId: state.gameId, playerId: botPlayerId, cardId })
        .then(() => {
          sounds.current.play('play');
          // Preload card images for faster rendering
          preloadCardImages(state);
        })
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

/** Preload card images for faster rendering during bot plays */
function preloadCardImages(state: GameState): void {
  try {
    // Preload images for cards in all hands and deck
    const cardIds = new Set<string>();

    // Cards in player hands
    for (const player of state.players) {
      for (const card of player.hand.toArray()) {
        cardIds.add(card.id);
      }
    }

    // Trump card
    if (state.trumpCard) {
      cardIds.add(state.trumpCard.id);
    }

    // Current trick cards
    for (const play of state.currentTrick.plays) {
      cardIds.add(play.card.id);
    }

    // Preload each unique card image
    for (const cardId of cardIds) {
      const img = new Image();
      img.src = `/cards/${cardId}.png`;
      // Don't await - just fire and forget for preloading
      img.decode().catch(() => undefined);
    }
  } catch {
    // Preloading is best-effort, don't break game if it fails
  }
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
    heartbeat: new HeartbeatUseCase(repository, engine, clock),
    markAbandoned: new MarkPlayerAbandonedUseCase(repository, engine, ids, clock),
  };
}

function loadLocalPlayer(displayName: string): CurrentPlayer {
  try {
    const stored = globalThis.localStorage?.getItem('briscas.localPlayer');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<CurrentPlayer>;
      if (typeof parsed.id === 'string' && typeof parsed.displayName === 'string') {
        return { id: parsed.id, displayName: displayName.trim() || parsed.displayName };
      }
    }
  } catch {
    globalThis.localStorage?.removeItem('briscas.localPlayer');
  }

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`,
    displayName: displayName.trim() || 'Jugador',
  };
}

function saveLocalPlayer(player: CurrentPlayer): void {
  try {
    globalThis.localStorage?.setItem('briscas.localPlayer', JSON.stringify(player));
  } catch {
    // Storage can be unavailable in private mode or after quota errors.
  }
}

function loadSoundPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem('briscas.soundEnabled') !== 'false';
  } catch {
    return true;
  }
}

function shouldSkipOpenGamePolling(): boolean {
  return import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.webdriver;
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
