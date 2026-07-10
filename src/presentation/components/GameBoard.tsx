import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { BriscasRules } from '../../domain/rules/BriscasRules';
import type { TrumpSwapRank } from '../../domain/rules/RulesEngine';
import { GameStatus } from '../../domain/game/Types';
import type { GameState } from '../../domain/game/GameState';
import type { Player } from '../../domain/game/Player';
import type { PlayedCard } from '../../domain/game/Trick';
import {
  ABANDONMENT_GRACE_MS,
  STALE_TICK_INTERVAL_MS,
} from '../../application/onlineConfig';
import { CardView } from './CardView';
import { Scoreboard } from './Scoreboard';
import { StatusBanner } from './StatusBanner';

interface GameBoardProps {
  readonly state: GameState;
  readonly viewPlayerId: string;
  readonly localMode: boolean;
  readonly busy: boolean;
  readonly message?: string | null;
  readonly soundEnabled: boolean;
  readonly onPlayCard: (cardId: string) => Promise<void>;
  readonly onToggleSound: () => void;
  readonly onSwapTrump: (exchangeRank: TrumpSwapRank) => Promise<void>;
  readonly onReset: () => Promise<void>;
  readonly onLeave: () => void;
}

const rules = new BriscasRules();

type Seat = 'north' | 'east' | 'south' | 'west';
type ResultView = 'summary' | 'score-evolution';

const TRICK_ORIENTATIONS: Record<Seat, number> = {
  north: 180,
  east: 90,
  south: 0,
  west: -90,
};

const SEATS: readonly Seat[] = ['north', 'east', 'south', 'west'];

/** Play phases for trick card lifecycle tracking */
const PlayPhase = Object.freeze({
  BOT_THINKING: "bot-thinking",
  CARD_COMMITTED: "card-committed",
  CARD_RENDERING: "card-rendering",
  CARD_VISIBLE: "card-visible",
  TRICK_HOLDING: "trick-holding",
  TRICK_COLLECTING: "trick-collecting",
} as const);

type PlayPhaseType = typeof PlayPhase[keyof typeof PlayPhase];

/** Minimum time cards must be fully visible before trick collection (ms) */
const MIN_BOT_CARD_VISIBLE_MS = 1200;
const MIN_FINAL_TRICK_CARD_VISIBLE_MS = 1600;

interface AnimatedTrick {
  readonly plays: readonly PlayedCard[];
  readonly winnerId: string;
  readonly version: number;
}

interface CardVisibilityState {
  readonly seat: Seat;
  readonly visibleAt: number | null;
  readonly phase: PlayPhaseType;
}

type HandSnapshot = Readonly<Record<string, readonly string[]>>;

export function GameBoard({
  state,
  viewPlayerId,
  localMode,
  busy,
  message,
  soundEnabled,
  onPlayCard,
  onToggleSound,
  onSwapTrump,
  onReset,
  onLeave,
}: GameBoardProps) {
  const tableAreaRef = useRef<HTMLElement>(null);
  const trickZoneRef = useRef<HTMLDivElement>(null);
  const scoreboardDrawerRef = useRef<HTMLDivElement>(null);
  const animatedPlayKeys = useRef(new Set<string>());
  const animatedCompletedVersion = useRef<number | null>(null);
  const animatedDealKey = useRef<string | null>(null);
  const animatedDrawVersion = useRef<number | null>(null);
  const previousHands = useRef<HandSnapshot>({});
  const previousTrumpCard = useRef(state.trumpCard);

  /* ── Card visibility tracking for bot plays ────────────────── */
  const cardVisibilityMap = useRef<Map<Seat, CardVisibilityState>>(new Map());
  const trickGeneration = useRef(0);
  const trickCollectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevExchangeEligible = useRef(false);
  const previousResultKey = useRef<string | null>(null);
  const resultDialogRef = useRef<HTMLElement | null>(null);
  const openScoreStatsButtonRef = useRef<HTMLButtonElement | null>(null);
  const scoreStatsCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreScoreButtonFocus = useRef(false);

  /* ── Dynamic trick-card sizing via ResizeObserver ─── */
  const [trickCardWidth, setTrickCardWidth] = useState(52);

  useEffect(() => {
    const el = tableAreaRef.current;
    if (!el) return;

    function computeTrickCardWidth(boardRect: DOMRect): number {
      const boardW = boardRect.width;
      const boardH = boardRect.height;

      /* Reserve margins for hands, deck, notification lane, info rail, clearance */
      const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top, 0px)') || '0', 10) || 0;
      const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom, 0px)') || '0', 10) || 0;
      const safeLeft = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-left, 0px)') || '0', 10) || 0;
      const safeRight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-right, 0px)') || '0', 10) || 0;

      const northDepth = Math.min(56, boardH * 0.06);
      const southDepth = Math.min(104, boardH * 0.12);
      const notificationLane = 36;
      const deckReserve = Math.min(48, boardW * 0.09);
      const infoRail = window.innerWidth <= 640 ? Math.min(52, boardW * 0.10) : 0;
      const clearance = 8;

      const usableW = boardW - safeLeft - safeRight - deckReserve - infoRail - clearance * 2;
      const usableH = boardH - safeTop - safeBottom - northDepth - southDepth - notificationLane - clearance * 2;

      /* Cross layout: 2 cards side-by-side horizontally, 2 stacked vertically, with offsets */
      const maxByWidth = usableW / 2.8;
      const maxByHeight = usableH / 4.2;
      const raw = Math.min(maxByWidth, maxByHeight);

      /* Clamp to target ranges by viewport class */
      const vw = window.innerWidth;
      let minW: number;
      let maxW: number;
      if (vw <= 359) { minW = 56; maxW = 66; }
      else if (vw <= 390) { minW = 62; maxW = 74; }
      else if (vw <= 480) { minW = 68; maxW = 80; }
      else if (vw <= 768) { minW = 76; maxW = 96; }
      else if (vw <= 1280) { minW = 104; maxW = 132; }
      else if (vw <= 1600) { minW = 120; maxW = 152; }
      else { minW = 132; maxW = 160; }

      return Math.round(Math.min(maxW, Math.max(minW, raw)));
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (rect.width > 0 && rect.height > 0) {
          setTrickCardWidth(computeTrickCardWidth(new DOMRect(0, 0, rect.width, rect.height)));
        }
      }
    });

    observer.observe(el);

    /* Initial measurement */
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setTrickCardWidth(computeTrickCardWidth(rect));
    }

    return () => observer.disconnect();
  }, []);

  /* ── Visual viewport listener: re-measure on mobile chrome changes ─── */
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    function handleViewportChange() {
      const el = tableAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        /* Force a re-render so the ResizeObserver callback re-fires */
        setTrickCardWidth((prev) => prev);
      }
    }
    vp.addEventListener('resize', handleViewportChange);
    vp.addEventListener('scroll', handleViewportChange);
    return () => {
      vp.removeEventListener('resize', handleViewportChange);
      vp.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  /** Wait for browser paint using double requestAnimationFrame */
  function waitForPaint(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }

  /** Wait for card image to decode if present */
  async function waitForCardImage(cardElement: HTMLElement | null): Promise<void> {
    if (!cardElement) return;
    const image = cardElement.querySelector('img');
    if (!image) return;

    if (!image.complete) {
      await new Promise<void>((resolve) => {
        const onLoad = () => { image.removeEventListener('load', onLoad); resolve(); };
        const onError = () => { image.removeEventListener('error', onError); resolve(); };
        image.addEventListener('load', onLoad, { once: true });
        image.addEventListener('error', onError, { once: true });
      });
    }

    if (typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch {
        // Image may already be usable despite decode rejection
      }
    }
  }

  /** Wait for entrance animation to complete */
  function waitForAnimation(element: HTMLElement, fallbackMs = 500): Promise<void> {
    return Promise.race([
      new Promise<void>((resolve) => {
        element.addEventListener('animationend', () => resolve(), { once: true });
        element.addEventListener('transitionend', () => resolve(), { once: true });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, fallbackMs)),
    ]);
  }

  /** Mark a card as fully visible */
  function markCardVisible(seat: Seat): void {
    const existing = cardVisibilityMap.current.get(seat);
    cardVisibilityMap.current.set(seat, {
      seat,
      visibleAt: performance.now(),
      phase: PlayPhase.CARD_VISIBLE,
    });
  }

  /** Get card visible timestamp */
  function getCardVisibleTimestamp(seat: Seat): number | null {
    return cardVisibilityMap.current.get(seat)?.visibleAt ?? null;
  }

  /** Check if all cards in a trick are visible */
  function allCardsVisible(occupiedSeats: readonly Seat[]): boolean {
    return occupiedSeats.every((seat) => {
      const state = cardVisibilityMap.current.get(seat);
      return state?.phase === PlayPhase.CARD_VISIBLE && state.visibleAt !== null;
    });
  }

  /** Hold card visible for minimum duration */
  async function holdVisibleCard(seat: Seat, minimumMs: number): Promise<void> {
    const visibleAt = getCardVisibleTimestamp(seat);
    if (visibleAt === null) return;

    const elapsed = performance.now() - visibleAt;
    const remaining = Math.max(0, minimumMs - elapsed);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }

  /** Schedule trick collection with proper timing */
  function scheduleTrickCollection(
    occupiedSeats: readonly Seat[],
    finalSeat: Seat
  ): void {
    // Cancel any existing collection timer
    if (trickCollectionTimer.current !== null) {
      clearTimeout(trickCollectionTimer.current);
      trickCollectionTimer.current = null;
    }

    const generation = ++trickGeneration.current;

    // Wait for all cards to become visible, then hold the final card
    const checkAndCollect = async () => {
      // Wait until all cards are visible
      const maxWait = 5000; // Safety timeout
      const startWait = performance.now();
      while (!allCardsVisible(occupiedSeats) && performance.now() - startWait < maxWait) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }

      // Check generation hasn't been invalidated
      if (generation !== trickGeneration.current) return;

      // All cards visible - now hold the final card for minimum duration
      await holdVisibleCard(finalSeat, MIN_FINAL_TRICK_CARD_VISIBLE_MS);

      // Check generation again
      if (generation !== trickGeneration.current) return;

      // Signal that trick can be collected
      trickCollectionTimer.current = null;
    };

    trickCollectionTimer.current = setTimeout(() => {
      void checkAndCollect();
    }, 100); // Small delay to let initial render settle
  }

  /* ── Notification queue ────────────────── */
  type NotificationType = 'swap' | 'trick-winner' | 'round-result' | 'turn-event' | 'error' | 'trump-exchange';

  interface QueuedNotification {
    readonly id: string;
    readonly type: NotificationType;
    readonly text: string;
    readonly durationMs: number;
  }

  const NOTIFICATION_DURATIONS: Record<NotificationType, number> = {
    'swap': 1500,
    'trick-winner': 2800,
    'round-result': 4000,
    'turn-event': 2200,
    'error': 3000,
    'trump-exchange': 4500,
  };

  const [notificationQueue, setNotificationQueue] = useState<readonly QueuedNotification[]>([]);
  const [activeNotification, setActiveNotification] = useState<QueuedNotification | null>(null);

  function enqueueNotification(text: string, type: NotificationType) {
    const id = globalThis.crypto?.randomUUID() ?? `${Date.now()}-${Math.random()}`;
    setNotificationQueue((prev) => [...prev, { id, type, text, durationMs: NOTIFICATION_DURATIONS[type] }]);
  }

  /* Process notification queue — show one at a time, sequentially */
  useEffect(() => {
    if (activeNotification) {
      return;
    }
    if (notificationQueue.length === 0) {
      return;
    }

    const next = notificationQueue[0];
    setActiveNotification(next);
    setNotificationQueue((prev) => prev.slice(1));

    const totalDuration = next.durationMs + 450; // fade in 200ms + visible + fade out 250ms
    const timer = setTimeout(() => {
      setActiveNotification(null);
    }, totalDuration);

    return () => clearTimeout(timer);
  }, [activeNotification, notificationQueue]);

  const [capturingTrick, setCapturingTrick] = useState<AnimatedTrick | null>(null);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [resultView, setResultView] = useState<ResultView | null>(null);
  // Tick a clock so the 4P "Desconectado…" badge can re-render when the
  // abandonment grace window elapses, even if no game event fires.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), STALE_TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  const viewPlayer = state.players.find((player) => player.id === viewPlayerId) ?? state.players[0];
  const opponents = state.players.filter((player) => player.id !== viewPlayer.id);
  const fourPlayer = state.players.length > 2;
  const sortedOpponents = fourPlayer
    ? [...opponents].sort((a, b) => a.seatIndex - b.seatIndex)
    : opponents;
  const gridPositions = fourPlayer
    ? sortedOpponents.map((opp) => {
        const relative = (opp.seatIndex - viewPlayer.seatIndex + 4) % 4;
        const position = relative === 1 ? 'right' : relative === 2 ? 'across' : 'left';
        return { player: opp, position } as const;
      })
    : [];

  const seatOf = (playerId: string): Seat => {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return 'south';
    const relative = (player.seatIndex - viewPlayer.seatIndex + 4) % 4;
    return (['south', 'east', 'north', 'west'] as const)[relative];
  };

  const playerBySeat: Record<Seat, Player | null> = {
    south: viewPlayer,
    east: gridPositions.find((p) => p.position === 'right')?.player ?? null,
    north: gridPositions.find((p) => p.position === 'across')?.player ?? null,
    west: gridPositions.find((p) => p.position === 'left')?.player ?? null,
  };

  const activePlayerName = state.players.find((player) => player.id === state.currentPlayerId)?.displayName ?? 'Nadie';
  const availableSwapRank = availableTrumpSwapRank(state, viewPlayer.id);
  const scoreStatsKey = state.status === GameStatus.Ended ? `${state.gameId}:${state.roundNumber}:${state.version}` : null;
  const resultText = state.status === GameStatus.Ended ? resultLabel(state) : null;
  const finalScores = state.status === GameStatus.Ended ? finalScoreRows(state) : [];
  const displayedPlays = capturingTrick?.plays ?? state.currentTrick.plays;
  const showFinalResult = state.status === GameStatus.Ended;
  const activeResultView: ResultView | null = showFinalResult ? resultView ?? 'summary' : null;
  const scoreEvolutionAvailable = state.status === GameStatus.Ended && hasScoreEvolutionData(state);

  const playsBySeat: Record<Seat, PlayedCard | null> = {
    north: null,
    east: null,
    south: null,
    west: null,
  };
  displayedPlays.forEach((play) => {
    playsBySeat[seatOf(play.playerId)] = play;
  });

  useEffect(() => {
    const prev = previousTrumpCard.current;
    previousTrumpCard.current = state.trumpCard;
    if (!prev || !state.trumpCard || prev.equals(state.trumpCard)) {
      return;
    }
    if (!state.trumpExchangeUsed) {
      return;
    }
    enqueueNotification(`Triunfo: ${state.trumpCard.toString()}`, 'swap');
  }, [state.trumpCard, state.trumpExchangeUsed]);

  /* Seven-exchange eligibility toast: fire once on false→true transition */
  useEffect(() => {
    const isEligible = availableSwapRank === 7;
    if (isEligible && !prevExchangeEligible.current) {
      const suitName = state.trumpCard?.suit ? `${state.trumpCard.suit}` : 'triunfo';
      enqueueNotification(
        `Tienes el 7 de ${suitName}. Pulsa INFO para cambiarlo por el triunfo.`,
        'trump-exchange',
      );
    }
    prevExchangeEligible.current = isEligible;
  }, [availableSwapRank, state.trumpCard]);

  useEffect(() => {
    if (!scoreboardOpen) {
      return;
    }

    function closeOnOutsideClick(event: PointerEvent) {
      if (!scoreboardDrawerRef.current?.contains(event.target as Node)) {
        setScoreboardOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setScoreboardOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [scoreboardOpen]);

  useEffect(() => {
    if (previousResultKey.current === scoreStatsKey) {
      return;
    }
    previousResultKey.current = scoreStatsKey;
    restoreScoreButtonFocus.current = false;
    setResultView(scoreStatsKey ? 'summary' : null);
  }, [scoreStatsKey]);

  useEffect(() => {
    if (!showFinalResult || activeResultView === null) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && activeResultView === 'score-evolution') {
        closeScoreStats();
      }
    }

    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [activeResultView, showFinalResult]);

  useEffect(() => {
    if (!showFinalResult || activeResultView === null) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (activeResultView === 'score-evolution') {
        scoreStatsCloseButtonRef.current?.focus();
        return;
      }
      if (restoreScoreButtonFocus.current) {
        restoreScoreButtonFocus.current = false;
        openScoreStatsButtonRef.current?.focus();
        return;
      }
      resultDialogRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeResultView, showFinalResult]);

  useLayoutEffect(() => {
    if (state.status !== GameStatus.Playing || state.deckSeed === null || !tableAreaRef.current) {
      previousHands.current = handSnapshot(state.players);
      return;
    }

    const dealKey = `${state.gameId}:${state.roundNumber}:${state.deckSeed}:${viewPlayer.id}`;
    if (animatedDealKey.current === dealKey) {
      return;
    }

    const stockCard = tableAreaRef.current.querySelector<HTMLElement>('.stock-deck-card');
    const dealtCards = Array.from(
      tableAreaRef.current.querySelectorAll<HTMLElement>(
        '.hand__cards > .card-back, .hand--south [data-card-id], .hand__cards > .card-view',
      ),
    );
    if (!stockCard || dealtCards.length === 0) {
      return;
    }

    animatedDealKey.current = dealKey;
    const stockRect = stockCard.getBoundingClientRect();
    const stockCenterX = stockRect.left + stockRect.width / 2;
    const stockCenterY = stockRect.top + stockRect.height / 2;
    const timeline = gsap.timeline({ delay: 0.12 });

    gsap.set(dealtCards, { transition: 'none' });
    dealtCards.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const isViewPlayerCard = Boolean(element.closest('.hand-row'));
      timeline.fromTo(
        element,
        {
          autoAlpha: 0,
          scale: isViewPlayerCard ? 0.9 : 0.22,
          x: isViewPlayerCard ? 0 : stockCenterX - (rect.left + rect.width / 2),
          y: isViewPlayerCard ? 0 : stockCenterY - (rect.top + rect.height / 2),
          rotation: isViewPlayerCard ? 0 : index % 2 === 0 ? -18 : 18,
        },
        {
          autoAlpha: 1,
          scale: 1,
          x: 0,
          y: 0,
          rotation: 0,
          duration: 0.56,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility,transition',
        },
        index * 0.075,
      );
    });

    return () => {
      timeline.kill();
      gsap.set(dealtCards, { clearProps: 'transform,opacity,visibility,transition' });
    };
  }, [state.deckSeed, state.gameId, state.players, state.roundNumber, state.status, viewPlayer.id]);

  useLayoutEffect(() => {
    const currentHands = handSnapshot(state.players);
    if (!state.lastCompletedTrick || animatedDrawVersion.current === state.version || !tableAreaRef.current) {
      previousHands.current = currentHands;
      return;
    }

    const drawTargets = state.players.flatMap((player) => {
      const previous = previousHands.current[player.id] ?? [];
      return currentHands[player.id]
        .filter((cardId) => !previous.includes(cardId))
        .map((cardId) => ({ playerId: player.id, cardId }));
    });

    animatedDrawVersion.current = state.version;
    previousHands.current = currentHands;

    if (drawTargets.length === 0) {
      return;
    }

    const stockCard = tableAreaRef.current.querySelector<HTMLElement>('.stock-deck-card');
    const sourceCard = stockCard?.querySelector<HTMLElement>('.card-back') ?? stockCard;
    if (!sourceCard) {
      return;
    }

    const sourceRect = sourceCard.getBoundingClientRect();
    const targetElements = drawTargets
      .map((draw) => targetElementForDraw(tableAreaRef.current as HTMLElement, draw.playerId, draw.cardId, viewPlayer.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (targetElements.length === 0) {
      return;
    }

    gsap.set(targetElements, { autoAlpha: 0, scale: 0.9 });
    const timeline = gsap.timeline({ delay: 0.28 });

    targetElements.forEach((target, index) => {
      const targetRect = target.getBoundingClientRect();
      const flyer = sourceCard.cloneNode(true) as HTMLElement;
      flyer.classList.add('dealt-card-flyer');
      document.body.append(flyer);

      gsap.set(flyer, {
        position: 'fixed',
        left: sourceRect.left,
        top: sourceRect.top,
        width: sourceRect.width,
        height: sourceRect.height,
        margin: 0,
        zIndex: 120,
        pointerEvents: 'none',
      });

      timeline.to(
        flyer,
        {
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width,
          height: targetRect.height,
          rotation: index % 2 === 0 ? -7 : 7,
          duration: 0.24,
          ease: 'power3.inOut',
          onComplete: () => flyer.remove(),
        },
        index * 0.05,
      );
      timeline.to(target, { autoAlpha: 1, scale: 1, duration: 0.1, ease: 'power2.out' }, index * 0.05 + 0.18);
    });

    return () => {
      timeline.kill();
      gsap.set(targetElements, { clearProps: 'transform,opacity,visibility' });
      document.querySelectorAll('.dealt-card-flyer').forEach((element) => element.remove());
    };
  }, [state.lastCompletedTrick, state.players, state.version, viewPlayer.id]);

  useLayoutEffect(() => {
    if (!state.lastCompletedTrick || !state.lastTrickWinnerId) {
      return;
    }

    if (animatedCompletedVersion.current === state.version) {
      return;
    }

    animatedCompletedVersion.current = state.version;
    setCapturingTrick({
      plays: state.lastCompletedTrick.plays,
      winnerId: state.lastTrickWinnerId,
      version: state.version,
    });

    /* Enqueue trick-winner notification */
    const winnerName = playerName(state, state.lastTrickWinnerId);
    enqueueNotification(`Baza para ${winnerName}`, 'trick-winner');
  }, [state.lastCompletedTrick, state.lastTrickWinnerId, state.version]);

  useLayoutEffect(() => {
    if (capturingTrick || !trickZoneRef.current) {
      return;
    }

    if (state.currentTrick.plays.length === 0) {
      animatedPlayKeys.current.clear();
      // Reset card visibility for new trick
      cardVisibilityMap.current.clear();
      return;
    }

    const elements = Array.from(trickZoneRef.current.querySelectorAll<HTMLElement>('.played-card'));
    state.currentTrick.plays.forEach((play, index) => {
      const key = playKeyFor(play);
      if (animatedPlayKeys.current.has(key)) {
        return;
      }

      const element = elements.find((candidate) => candidate.dataset.playKey === key);
      if (!element) {
        return;
      }

      const seat = seatOf(play.playerId);

      // Mark as rendering
      cardVisibilityMap.current.set(seat, {
        seat,
        visibleAt: null,
        phase: PlayPhase.CARD_RENDERING,
      });

      animatedPlayKeys.current.add(key);

      // Animate entrance
      gsap.fromTo(
        element,
        {
          autoAlpha: 0,
          scale: 0.76,
          y: play.playerId === viewPlayer.id ? 92 : -76,
          x: play.playerId === viewPlayer.id ? 0 : index % 2 === 0 ? -28 : 28,
          rotation: play.playerId === viewPlayer.id ? -4 : 5,
        },
        {
          autoAlpha: 1,
          scale: 1,
          x: 0,
          y: 0,
          rotation: 0,
          duration: 0.24,
          ease: 'power3.out',
          onComplete: () => {
            // After animation completes, wait for paint and mark visible
            void (async () => {
              await waitForPaint();
              await waitForCardImage(element);
              markCardVisible(seat);
            })();
          },
        },
      );
    });

    // Schedule trick collection after all cards are visible
    const occupiedSeats = state.currentTrick.plays.map((play) => seatOf(play.playerId)) as Seat[];
    const finalPlay = state.currentTrick.plays[state.currentTrick.plays.length - 1];
    if (finalPlay && occupiedSeats.length === 4) {
      const finalSeat = seatOf(finalPlay.playerId);
      scheduleTrickCollection(occupiedSeats, finalSeat);
    }
  }, [capturingTrick, state.currentTrick.plays, viewPlayer.id]);

  useLayoutEffect(() => {
    if (!capturingTrick || !trickZoneRef.current || !tableAreaRef.current) {
      return;
    }

    const elements = Array.from(trickZoneRef.current.querySelectorAll<HTMLElement>('.played-card--capturing'));
    const target = Array.from(tableAreaRef.current.querySelectorAll<HTMLElement>('.hand[data-player-target]')).find(
      (element) => element.dataset.playerTarget === capturingTrick.winnerId,
    );
    const targetRect = (target ?? tableAreaRef.current).getBoundingClientRect();

    const timeline = gsap.timeline({
      onComplete: () => {
        setCapturingTrick((current) => (current?.version === capturingTrick.version ? null : current));
        // Clear card visibility for next trick
        cardVisibilityMap.current.clear();
      },
    });

    timeline.fromTo(
      elements,
      { autoAlpha: 0, scale: 0.82, y: 24, rotation: -3 },
      { autoAlpha: 1, scale: 1, y: 0, rotation: 0, duration: 0.16, stagger: 0.03, ease: 'power2.out' },
    );
    timeline.to(elements, {
      autoAlpha: 0,
      scale: 0.36,
      rotation: (index) => (index % 2 === 0 ? -12 : 12),
      x: (_, element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        return targetRect.left + targetRect.width / 2 - (rect.left + rect.width / 2);
      },
      y: (_, element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        return targetRect.top + targetRect.height / 2 - (rect.top + rect.height / 2);
      },
      duration: 0.34,
      stagger: 0.03,
      ease: 'power3.inOut',
    });

    return () => {
      timeline.kill();
    };
  }, [capturingTrick, state.status]);

  function closeScoreStats() {
    restoreScoreButtonFocus.current = true;
    setResultView('summary');
  }

  function openScoreStats() {
    if (scoreEvolutionAvailable) {
      restoreScoreButtonFocus.current = false;
      setResultView('score-evolution');
    }
  }

  function resetFromResults() {
    setResultView(null);
    void onReset();
  }

  function leaveFromResults() {
    setResultView(null);
    onLeave();
  }

  const notificationElement = activeNotification ? (
    <div
      className={`notification notification--${activeNotification.type}`}
      role="status"
      aria-live="polite"
      style={{ '--duration': `${activeNotification.durationMs + 450}ms` } as CSSProperties}
    >
      {activeNotification.text}
    </div>
  ) : null;

  return (
    <main className={`game-shell ${localMode ? 'game-shell--local' : 'game-shell--online'}`}>
      {fourPlayer ? null : notificationElement}
      {fourPlayer ? (
        <section className="table-area table-area--4p" aria-label="Mesa de juego" ref={tableAreaRef} style={{ '--trick-card-width': `${trickCardWidth}px` } as CSSProperties}>
          <div className="board-layer deck-layer" data-layer="deck">
            <div className="deck-zone" aria-label="Mazo y triunfo">
              <div className="deck-zone__trump" aria-hidden="true">
                {state.trumpCard ? (
                  <CardView card={state.trumpCard} label={`Triunfo: ${state.trumpCard.toString()}`} />
                ) : null}
              </div>
              <div className="deck-zone__deck">
                <div className="deck-zone__deck-inner">
                  <div className={`stock-deck-card ${state.deck.isEmpty ? 'stock-deck-card--empty' : ''}`}>
                    {state.deck.isEmpty ? <span>Mazo vacío</span> : <CardView hidden label="Mazo de cartas" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="board-layer hand-clipping-layer" data-layer="hands">
            {playerBySeat.north ? (() => {
              const p = playerBySeat.north!;
              return (
                <div
                  key={`hand-north-${p.id}`}
                  className={`hand hand--north ${state.currentPlayerId === p.id ? 'is-active' : ''}`}
                  data-player-target={p.id}
                  aria-label={`Mano de ${p.displayName}`}
                >
                  {renderPlayerBadge(p, now, ABANDONMENT_GRACE_MS)}
                  <div className="hand__cards">
                    {Array.from({ length: p.hand.size }, (_, i) => (
                      <CardView key={i} hidden />
                    ))}
                  </div>
                </div>
              );
            })() : null}

            {playerBySeat.east ? (() => {
              const p = playerBySeat.east!;
              return (
                <div
                  key={`hand-east-${p.id}`}
                  className={`hand hand--east ${state.currentPlayerId === p.id ? 'is-active' : ''}`}
                  data-player-target={p.id}
                  aria-label={`Mano de ${p.displayName}`}
                >
                  {renderPlayerBadge(p, now, ABANDONMENT_GRACE_MS)}
                  <div className="hand__cards">
                    {Array.from({ length: p.hand.size }, (_, i) => (
                      <div className="hand__card-wrapper" key={i}>
                        <CardView hidden />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : null}

            {playerBySeat.west ? (() => {
              const p = playerBySeat.west!;
              return (
                <div
                  key={`hand-west-${p.id}`}
                  className={`hand hand--west ${state.currentPlayerId === p.id ? 'is-active' : ''}`}
                  data-player-target={p.id}
                  aria-label={`Mano de ${p.displayName}`}
                >
                  {renderPlayerBadge(p, now, ABANDONMENT_GRACE_MS)}
                  <div className="hand__cards">
                    {Array.from({ length: p.hand.size }, (_, i) => (
                      <div className="hand__card-wrapper" key={i}>
                        <CardView hidden />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : null}

            <div
              key={`hand-south-${viewPlayer.id}`}
              className={`hand hand--south ${state.currentPlayerId === viewPlayer.id ? 'is-active' : ''}`}
              aria-label={`Mano de ${viewPlayer.displayName}`}
              data-player-target={viewPlayer.id}
            >
              <div className="hand__cards">
                {viewPlayer.hand.toArray().map((card) => {
                  const validation = rules.canPlayCard(state, viewPlayer.id, card);
                  return (
                    <CardView
                      key={card.id}
                      card={card}
                      dataCardId={card.id}
                      disabled={busy || Boolean(capturingTrick) || !validation.valid}
                      onClick={() => void onPlayCard(card.id)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="board-layer trick-layer" data-layer="trick">
            <div className="trick-zone" ref={trickZoneRef} aria-label="Baza actual">
              {SEATS.map((seat) => (
                <div key={seat} className={`trick-slot trick-slot--${seat}`} data-seat={seat}>
                  {playsBySeat[seat] ? (
                    <div
                      key={`${capturingTrick?.version ?? 'current'}-${playsBySeat[seat]!.playerId}-${playsBySeat[seat]!.card.id}`}
                      className={`played-card ${capturingTrick ? 'played-card--capturing' : ''} ${
                        state.currentPlayerId === playsBySeat[seat]!.playerId ? 'is-active' : ''
                      }`}
                      style={{ transform: `rotate(${TRICK_ORIENTATIONS[seat]}deg)` }}
                      data-play-key={playKeyFor(playsBySeat[seat]!)}
                      title={playerName(state, playsBySeat[seat]!.playerId)}
                    >
                      <CardView
                        card={playsBySeat[seat]!.card}
                        label={`${playerName(state, playsBySeat[seat]!.playerId)} jugó ${playsBySeat[seat]!.card.toString()}`}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="board-layer player-label-layer" data-layer="labels">
            <div
              className="turn-indicator-4p"
              role="status"
              aria-live="polite"
              data-turn-owner={state.currentPlayerId ?? ''}
            >
              {state.status === GameStatus.Playing ? (
                <span>
                  Toca: <strong>{activePlayerName}</strong>
                </span>
              ) : (
                <span>
                  {state.abandonedPlayerIds.length > 0 ? 'Partida interrumpida' : state.status === GameStatus.Ended ? 'Partida terminada' : 'Esperando…'}
                </span>
              )}
            </div>
            {playerBySeat.north ? <PlayerLabel key={`name-north-${playerBySeat.north.id}`} player={playerBySeat.north} seat="north" /> : null}
            {playerBySeat.east ? <PlayerLabel key={`name-east-${playerBySeat.east.id}`} player={playerBySeat.east} seat="east" /> : null}
            {playerBySeat.west ? <PlayerLabel key={`name-west-${playerBySeat.west.id}`} player={playerBySeat.west} seat="west" /> : null}
            <PlayerLabel player={viewPlayer} seat="south" />
          </div>

          <div className="board-layer notification-layer" data-layer="notifications">
            {notificationElement}
          </div>

        </section>
      ) : (
      <section className="table-area" aria-label="Mesa de juego" ref={tableAreaRef}>
        <header className="game-topbar panel">
          <div>
            <p className="eyebrow">Sala {state.gameId}</p>
            <h1>{state.status === GameStatus.Ended ? 'Partida terminada' : `Turno: ${activePlayerName}`}</h1>
          </div>
          {localMode ? (
            <p className="hint">Modo local contra IA</p>
          ) : null}
          <button type="button" className="sound-toggle" onClick={onToggleSound} aria-pressed={soundEnabled}>
            Sonido {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </header>

        <div className="status-stack" aria-live="polite">
          <StatusBanner message={message} tone="error" />
          {state.status === GameStatus.Ended ? (
            <button type="button" className="stats-open-button" onClick={openScoreStats}>
              Ver estadisticas
            </button>
          ) : null}
        </div>

        <div className="opponent-row">
          {opponents.map((player) => (
            <OpponentHand key={player.id} player={player} active={state.currentPlayerId === player.id} />
          ))}
        </div>

        <div className="table-center">
          <div className="trick-zone" aria-label="Baza actual" ref={trickZoneRef}>
            {displayedPlays.map((play) => (
              <div
                key={`${capturingTrick?.version ?? 'current'}-${play.playerId}-${play.card.id}`}
                className={`played-card ${capturingTrick ? 'played-card--capturing' : ''}`}
                data-play-key={playKeyFor(play)}
              >
                <CardView card={play.card} label={`${playerName(state, play.playerId)} jugó ${play.card.toString()}`} />
                <span>{playerName(state, play.playerId)}</span>
              </div>
            ))}
          </div>

          <section className="hand-panel panel" aria-label={`Mano de ${viewPlayer.displayName}`} data-player-target={viewPlayer.id}>
            <div className="hand-heading">
              <h2>{viewPlayer.displayName}</h2>
              <p>{state.currentPlayerId === viewPlayer.id ? 'Puedes jugar una carta.' : 'Espera tu turno.'}</p>
            </div>
            <div className="hand-row">
              {viewPlayer.hand.toArray().map((card) => {
                const validation = rules.canPlayCard(state, viewPlayer.id, card);
                return (
                  <CardView
                    key={card.id}
                    card={card}
                    dataCardId={card.id}
                    disabled={busy || Boolean(capturingTrick) || !validation.valid}
                    onClick={() => void onPlayCard(card.id)}
                  />
                );
              })}
            </div>
          </section>

          <div className="stock-zone panel" aria-label="Mazo y triunfo">
            <div className="stock-counter">
              <span className="stock-count">{state.deck.count}</span>
              <small>cartas en mazo</small>
            </div>
            <div className="stock-stack" aria-label="Mazo sobre carta de triunfo horizontal">
              {state.trumpCard ? (
                <div className={`trump-card-face ${state.deck.isEmpty ? 'trump-card-face--ghost' : ''}`}>
                  <CardView card={state.trumpCard} label={`Triunfo: ${state.trumpCard.toString()}`} />
                </div>
              ) : null}
              <div className={`stock-deck-card ${state.deck.isEmpty ? 'stock-deck-card--empty' : ''}`}>
                {state.deck.isEmpty ? <span>Mazo vacío</span> : <CardView hidden label="Mazo de cartas" />}
              </div>
            </div>
            {state.trumpCard ? (
              <p className="trump-label">Triunfo: {state.trumpCard.toString()}</p>
            ) : (
              <p>Sin triunfo visible</p>
            )}
            <div className="stock-actions" aria-label="Acciones de partida">
              {availableSwapRank ? (
                <button
                  type="button"
                  className="swap-action"
                  disabled={busy || Boolean(capturingTrick)}
                  onClick={() => void onSwapTrump(availableSwapRank)}
                >
                  {swapButtonLabel(availableSwapRank)}
                </button>
              ) : null}
              <button type="button" className="secondary" disabled={busy || Boolean(capturingTrick)} onClick={() => void onReset()}>
                Nueva ronda
              </button>
              <button type="button" className="secondary" onClick={onLeave}>
                Menú
              </button>
            </div>
          </div>
        </div>

      </section>
      )}

      {showFinalResult ? createPortal(
        <div className="result-overlay" data-result-view={activeResultView ?? 'summary'}>
          {activeResultView === 'score-evolution' ? (
            <div
              className="score-modal panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="score-evolution-title"
              ref={(node) => { resultDialogRef.current = node; }}
              tabIndex={-1}
            >
              <button
                type="button"
                className="score-modal__close"
                onClick={closeScoreStats}
                aria-label="Cerrar estadisticas y volver al resultado final"
                ref={scoreStatsCloseButtonRef}
              >
                Cerrar
              </button>
              <ScoreEvolutionChart state={state} />
            </div>
          ) : (
            <section
              className="final-result-card panel"
              aria-live="polite"
              aria-labelledby="final-result-title"
              role="dialog"
              aria-modal="true"
              data-portaled="true"
              ref={(node) => { resultDialogRef.current = node; }}
              tabIndex={-1}
            >
              <p className="eyebrow">Resultado final</p>
              <h2 id="final-result-title">{resultText}</h2>
              <dl>
                {finalScores.map((row) => (
                  <div key={row.ownerId} className={row.winning ? 'is-winner' : ''}>
                    <dt>{row.label}</dt>
                    <dd>{row.score} pts</dd>
                  </div>
                ))}
              </dl>
              {!scoreEvolutionAvailable ? (
                <p id="score-evolution-unavailable" className="result-overlay__hint">
                  No hay suficientes datos de puntuación para mostrar la gráfica.
                </p>
              ) : null}
              <div className="final-result-actions">
                <button
                  type="button"
                  onClick={openScoreStats}
                  disabled={!scoreEvolutionAvailable}
                  aria-describedby={!scoreEvolutionAvailable ? 'score-evolution-unavailable' : undefined}
                  ref={openScoreStatsButtonRef}
                >
                  Ver gráfica
                </button>
                <button type="button" className="secondary" disabled={busy || Boolean(capturingTrick)} onClick={resetFromResults}>
                  Nueva ronda
                </button>
                <button type="button" className="secondary" onClick={leaveFromResults}>
                  Menú
                </button>
              </div>
            </section>
          )}
        </div>,
        document.body
      ) : null}

      <div
        className={`scoreboard-drawer ${scoreboardOpen ? 'scoreboard-drawer--open' : ''} ${availableSwapRank ? 'has-trump-exchange' : ''}`}
        ref={scoreboardDrawerRef}
      >
        <button
          type="button"
          className="scoreboard-tab"
          aria-controls="scoreboard-drawer-panel"
          aria-expanded={scoreboardOpen}
          aria-label={availableSwapRank ? 'Info. Hay un cambio de triunfo disponible.' : 'Info'}
          onClick={() => setScoreboardOpen((open) => !open)}
        >
          <span className="scoreboard-tab__arrow" aria-hidden="true">
            {scoreboardOpen ? '‹' : '›'}
          </span>
          <span>Info</span>
        </button>
        <div id="scoreboard-drawer-panel" className="scoreboard-drawer__panel">
          <div className="mobile-drawer-controls" aria-label="Controles de partida">
            <div className="mobile-drawer-summary">
              <p className="eyebrow">Sala {state.gameId}</p>
              <h2>{state.status === GameStatus.Ended ? 'Partida terminada' : `Turno: ${activePlayerName}`}</h2>
              {localMode ? <p className="hint">Modo local contra IA</p> : null}
            </div>
            <StatusBanner message={message} tone="error" />
            {state.status === GameStatus.Ended ? (
              <button type="button" className="stats-open-button" onClick={openScoreStats}>
                Ver estadisticas
              </button>
            ) : null}
            <button type="button" className="sound-toggle" onClick={onToggleSound} aria-pressed={soundEnabled}>
              Sonido {soundEnabled ? 'ON' : 'OFF'}
            </button>
            <div className="mobile-drawer-actions">
              {availableSwapRank ? (
                <button
                  type="button"
                  className="swap-action"
                  disabled={busy || Boolean(capturingTrick)}
                  onClick={() => void onSwapTrump(availableSwapRank)}
                >
                  {swapButtonLabel(availableSwapRank)}
                </button>
              ) : null}
              <button type="button" className="secondary" disabled={busy || Boolean(capturingTrick)} onClick={() => void onReset()}>
                Nueva ronda
              </button>
              <button type="button" className="secondary" onClick={onLeave}>
                Menú
              </button>
            </div>
          </div>
          <Scoreboard state={state} />
        </div>
      </div>
    </main>
  );
}

function hasScoreEvolutionData(state: GameState): boolean {
  return Object.keys(state.scores).length > 0 || state.scoreHistory.some((entry) => Object.keys(entry.scores).length > 0);
}

function ScoreEvolutionChart({ state }: { readonly state: GameState }) {
  const history = state.scoreHistory.length > 0 ? state.scoreHistory : [{ trickIndex: 0, scores: state.scores }];
  const ownerIds = scoreOwnerIds(state, history);

  if (ownerIds.length === 0) {
    return (
      <section className="score-evolution" aria-labelledby="score-evolution-title" data-testid="score-evolution-view">
        <div className="score-evolution__heading">
          <div>
            <p className="eyebrow">Estadísticas</p>
            <h2 id="score-evolution-title">Evolución acumulada</h2>
          </div>
        </div>
        <p className="score-evolution__empty">No hay historial de puntuación disponible para esta partida.</p>
      </section>
    );
  }

  const maxIndex = Math.max(...history.map((entry) => entry.trickIndex), 1);
  const maxScore = Math.max(120, ...history.flatMap((entry) => ownerIds.map((ownerId) => entry.scores[ownerId] ?? 0)));
  const bounds = { left: 58, top: 24, width: 560, height: 220 };
  const yTicks = [0, 30, 60, 90, 120].filter((tick) => tick <= maxScore);
  const finalEntry = history.at(-1);
  const finalTotals = ownerIds.map((ownerId) => ({ ownerId, score: finalEntry?.scores[ownerId] ?? state.scores[ownerId] ?? 0 }));
  const labelYs = adjustedLabelYs(
    ownerIds.map((ownerId) => ({ ownerId, y: yFor(finalEntry?.scores[ownerId] ?? 0) })),
    bounds.top + 10,
    bounds.top + bounds.height - 10,
    20,
  );

  function xFor(trickIndex: number): number {
    return bounds.left + (trickIndex / maxIndex) * bounds.width;
  }

  function yFor(score: number): number {
    return bounds.top + bounds.height - (score / maxScore) * bounds.height;
  }

  function pathFor(ownerId: string): string {
    return history
      .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${xFor(entry.trickIndex).toFixed(2)} ${yFor(entry.scores[ownerId] ?? 0).toFixed(2)}`)
      .join(' ');
  }

  return (
    <section className="score-evolution" aria-labelledby="score-evolution-title" data-testid="score-evolution-view">
      <div className="score-evolution__heading">
        <div>
          <p className="eyebrow">Estadísticas</p>
          <h2 id="score-evolution-title">Evolución acumulada</h2>
        </div>
      </div>
      <div className="score-evolution-chart-container" data-testid="score-evolution-chart-container">
        <svg className="score-chart" viewBox="0 0 820 320" role="img" aria-label="Gráfica de puntuación acumulada por baza" data-testid="score-evolution-chart">
          <rect width="820" height="320" rx="20" fill="#000" />
          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={bounds.left} y1={y} x2={bounds.left + bounds.width} y2={y} className="score-chart__grid" />
                <text x={bounds.left - 12} y={y + 4} className="score-chart__tick" textAnchor="end">
                  {tick}
                </text>
              </g>
            );
          })}
          <line x1={bounds.left} y1={bounds.top} x2={bounds.left} y2={bounds.top + bounds.height} className="score-chart__axis" />
          <line
            x1={bounds.left}
            y1={bounds.top + bounds.height}
            x2={bounds.left + bounds.width}
            y2={bounds.top + bounds.height}
            className="score-chart__axis"
          />
          <text x={bounds.left + bounds.width / 2} y="292" className="score-chart__axis-label" textAnchor="middle">
            Baza
          </text>
          <text x="18" y={bounds.top + bounds.height / 2} className="score-chart__axis-label" textAnchor="middle" transform={`rotate(-90 18 ${bounds.top + bounds.height / 2})`}>
            Puntos acumulados
          </text>
          {ownerIds.map((ownerId, index) => {
            const color = chartColor(index);
            const lastScore = history.at(-1)?.scores[ownerId] ?? 0;
            const endpointY = yFor(lastScore);
            const labelY = labelYs[ownerId] ?? endpointY;
            return (
              <g key={ownerId} data-owner-id={ownerId} data-final-score={lastScore} data-testid="score-series">
                <path d={pathFor(ownerId)} fill="none" stroke={color} className="score-chart__line" />
                {history.map((entry) => (
                  <circle key={`${ownerId}-${entry.trickIndex}`} cx={xFor(entry.trickIndex)} cy={yFor(entry.scores[ownerId] ?? 0)} r="3.5" fill={color} />
                ))}
                <line
                  x1={bounds.left + bounds.width}
                  y1={endpointY}
                  x2={bounds.left + bounds.width + 16}
                  y2={labelY}
                  stroke={color}
                  className="score-chart__leader"
                />
                <text x={bounds.left + bounds.width + 22} y={labelY + 4} fill={color} className="score-chart__label">
                  {scoreOwnerLabel(state, ownerId)} {lastScore}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="score-evolution__summary" aria-label="Resumen textual de la puntuación final">
        <p>Totales finales acumulados:</p>
        <ul>
          {finalTotals.map(({ ownerId, score }) => (
            <li key={ownerId} data-owner-id={ownerId} data-final-score={score}>
              <strong>{scoreOwnerLabel(state, ownerId)}:</strong> {score} pts
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function adjustedLabelYs(
  labels: readonly { readonly ownerId: string; readonly y: number }[],
  minY: number,
  maxY: number,
  minGap: number,
): Readonly<Record<string, number>> {
  const positioned = [...labels]
    .sort((left, right) => left.y - right.y)
    .map((label) => ({ ...label, y: clamp(label.y, minY, maxY) }));

  for (let index = 1; index < positioned.length; index += 1) {
    positioned[index].y = Math.max(positioned[index].y, positioned[index - 1].y + minGap);
  }

  const overflow = positioned.at(-1) ? positioned[positioned.length - 1].y - maxY : 0;
  if (overflow > 0) {
    positioned.forEach((label) => {
      label.y -= overflow;
    });
  }

  if (positioned[0]?.y < minY) {
    const shift = minY - positioned[0].y;
    positioned.forEach((label) => {
      label.y += shift;
    });
  }

  for (let index = 1; index < positioned.length; index += 1) {
    positioned[index].y = Math.max(positioned[index].y, positioned[index - 1].y + minGap);
  }

  return Object.fromEntries(positioned.map((label) => [label.ownerId, label.y]));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function scoreOwnerIds(state: GameState, history: readonly { readonly scores: Readonly<Record<string, number>> }[]): readonly string[] {
  const ids = new Set<string>();
  Object.keys(state.scores).forEach((ownerId) => ids.add(ownerId));
  history.forEach((entry) => Object.keys(entry.scores).forEach((ownerId) => ids.add(ownerId)));
  return [...ids];
}

function chartColor(index: number): string {
  return ['#f5c542', '#5eead4', '#a78bfa', '#fb7185'][index % 4];
}

function scoreOwnerLabel(state: GameState, ownerId: string): string {
  const teamPlayers = state.players.filter((player) => player.teamId === ownerId);
  if (teamPlayers.length > 0) {
    const names = teamPlayers.map((player) => player.displayName).join(', ');
    return `Equipo ${ownerId.endsWith('0') ? 'A' : 'B'} (${names})`;
  }

  return playerName(state, ownerId);
}

function finalScoreRows(state: GameState): readonly {
  readonly ownerId: string;
  readonly label: string;
  readonly score: number;
  readonly winning: boolean;
}[] {
  return Object.entries(state.scores)
    .map(([ownerId, score]) => ({
      ownerId,
      label: scoreOwnerLabel(state, ownerId),
      score,
      winning: state.winnerIds.includes(ownerId),
    }))
    .sort((left, right) => right.score - left.score);
}

function availableTrumpSwapRank(state: GameState, playerId: string): TrumpSwapRank | null {
  if (rules.canSwapTrump(state, playerId, 7).valid) {
    return 7;
  }

  if (rules.canSwapTrump(state, playerId, 2).valid) {
    return 2;
  }

  return null;
}

function swapButtonLabel(exchangeRank: TrumpSwapRank): string {
  return exchangeRank === 7 ? '¿Intercambiar siete?' : '¿Intercambiar dos?';
}

function OpponentHand({ player, active }: { readonly player: Player; readonly active: boolean }) {
  return (
    <div
      className={`opponent-hand panel ${active ? 'is-active' : ''} ${player.abandonedAt !== null ? 'is-abandoned' : ''}`}
      data-player-target={player.id}
    >
      <strong>{player.displayName}</strong>
      {player.abandonedAt !== null ? <span className="opponent-hand__badge">Abandonó</span> : null}
      <div className="mini-hand" aria-label={`${player.hand.size} cartas ocultas`}>
        {Array.from({ length: player.hand.size }, (_, index) => (
          <CardView key={index} hidden />
        ))}
      </div>
    </div>
  );
}

function handSnapshot(players: readonly Player[]): HandSnapshot {
  return Object.fromEntries(players.map((player) => [player.id, player.hand.toArray().map((card) => card.id)]));
}

function targetElementForDraw(tableArea: HTMLElement, playerId: string, cardId: string, viewPlayerId: string): HTMLElement | null {
  const playerArea = Array.from(tableArea.querySelectorAll<HTMLElement>('[data-player-target]')).find(
    (element) => element.dataset.playerTarget === playerId,
  );

  if (!playerArea) {
    return null;
  }

  if (playerId === viewPlayerId) {
    return Array.from(playerArea.querySelectorAll<HTMLElement>('[data-card-id]')).find(
      (element) => element.dataset.cardId === cardId,
    ) ?? null;
  }

  return Array.from(playerArea.querySelectorAll<HTMLElement>('.hand__cards > .card-back')).at(-1) ?? null;
}

function playKeyFor(play: PlayedCard): string {
  return `${play.playerId}:${play.card.id}`;
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((player) => player.id === playerId)?.displayName ?? playerId;
}

function resultLabel(state: GameState): string {
  if (state.abandonedPlayerIds.length > 0) {
    return abandonedResultLabel(state);
  }
  if (state.winnerIds.length === 0) {
    return 'Empate sin ganador declarado.';
  }

  const labels = state.winnerIds.map((winnerId) => {
    const teamPlayers = state.players.filter((player) => player.teamId === winnerId);
    if (teamPlayers.length > 0) {
      const names = teamPlayers.map((player) => player.displayName).join(', ');
      return `Equipo ${winnerId.endsWith('0') ? 'A' : 'B'} (${names})`;
    }

    return playerName(state, winnerId);
  });

  return `Ganador: ${labels.join(', ')}`;
}

function abandonedResultLabel(state: GameState): string {
  const abandoner = state.players.find((player) => state.abandonedPlayerIds.includes(player.id));
  const winnerId = state.winnerIds[0];
  if (!abandoner || !winnerId) {
    return 'Partida interrumpida por abandono.';
  }
  const teamPlayers = state.players.filter((player) => player.teamId === winnerId);
  const winnerLabel = teamPlayers.length > 0
    ? `Equipo ${winnerId.endsWith('0') ? 'A' : 'B'} (${teamPlayers.map((player) => player.displayName).join(', ')})`
    : playerName(state, winnerId);
  return `${abandoner.displayName} abandonó la sala. Gana ${winnerLabel}.`;
}

function renderPlayerBadge(player: Player, now: number, graceMs: number): JSX.Element | null {
  if (player.abandonedAt !== null) {
    return <span className="hand__badge">Abandonó</span>;
  }
  if (player.isStale(now, graceMs)) {
    return <span className="hand__badge hand__badge--warn">Desconectado…</span>;
  }
  return null;
}

function PlayerLabel({ player, seat }: { readonly player: Player; readonly seat: Seat }) {
  return (
    <div className={`player-label player-label--${seat} hand__name hand__name--${seat}`} data-player-label={seat}>
      {player.displayName}
    </div>
  );
}
