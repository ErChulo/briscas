import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
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

interface AnimatedTrick {
  readonly plays: readonly PlayedCard[];
  readonly winnerId: string;
  readonly version: number;
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
  const [capturingTrick, setCapturingTrick] = useState<AnimatedTrick | null>(null);
  const [showFinalResult, setShowFinalResult] = useState(false);
  const [swapNotification, setSwapNotification] = useState<string | null>(null);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [openScoreStatsKey, setOpenScoreStatsKey] = useState<string | null>(null);
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
  const activePlayerName = state.players.find((player) => player.id === state.currentPlayerId)?.displayName ?? 'Nadie';
  const availableSwapRank = availableTrumpSwapRank(state, viewPlayer.id);
  const scoreStatsKey = state.status === GameStatus.Ended ? `${state.gameId}:${state.roundNumber}:${state.version}` : null;
  const scoreStatsOpen = Boolean(scoreStatsKey && openScoreStatsKey === scoreStatsKey);
  const resultText = state.status === GameStatus.Ended ? resultLabel(state) : null;
  const finalScores = state.status === GameStatus.Ended ? finalScoreRows(state) : [];
  const displayedPlays = capturingTrick?.plays ?? state.currentTrick.plays;

  useEffect(() => {
    if (state.status === GameStatus.Playing) {
      setShowFinalResult(false); // eslint-disable-line react-hooks/set-state-in-effect -- reset derived state on round change
    } else if (state.status === GameStatus.Ended) {
      // Show result card immediately (smooth CSS fade-in handles the transition).
      setShowFinalResult(true); // eslint-disable-line react-hooks/set-state-in-effect -- game ended
    }
  }, [state.status]);

  useEffect(() => {
    const prev = previousTrumpCard.current;
    previousTrumpCard.current = state.trumpCard;
    if (!prev || !state.trumpCard || prev.equals(state.trumpCard)) {
      return;
    }
    if (!state.trumpExchangeUsed) {
      return;
    }
    setSwapNotification(`Triunfo: ${state.trumpCard.toString()}`); // eslint-disable-line react-hooks/set-state-in-effect -- sync external trump change
    const timer = setTimeout(() => setSwapNotification(null), 1500);
    return () => clearTimeout(timer);
  }, [state.trumpCard, state.trumpExchangeUsed]);

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
    if (!scoreStatsOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && scoreStatsKey) {
        setOpenScoreStatsKey(null);
      }
    }

    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [scoreStatsKey, scoreStatsOpen]);

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
        '.mini-hand > .card-back, .hand-row > .card-view, .owner-hand-4p [data-card-id]',
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
  }, [state.lastCompletedTrick, state.lastTrickWinnerId, state.version]);

  useLayoutEffect(() => {
    if (capturingTrick || !trickZoneRef.current) {
      return;
    }

    if (state.currentTrick.plays.length === 0) {
      animatedPlayKeys.current.clear();
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

      animatedPlayKeys.current.add(key);
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
        },
      );
    });
  }, [capturingTrick, state.currentTrick.plays, viewPlayer.id]);

  useLayoutEffect(() => {
    if (!capturingTrick || !trickZoneRef.current || !tableAreaRef.current) {
      return;
    }

    const elements = Array.from(trickZoneRef.current.querySelectorAll<HTMLElement>('.played-card--capturing'));
    const target = Array.from(tableAreaRef.current.querySelectorAll<HTMLElement>('.seat-4p [data-player-target]')).find(
      (element) => element.dataset.playerTarget === capturingTrick.winnerId,
    );
    const targetRect = (target ?? tableAreaRef.current).getBoundingClientRect();

    const isLastTrick = state.status === GameStatus.Ended;
    const timeline = gsap.timeline({
      onComplete: () => {
        setCapturingTrick((current) => (current?.version === capturingTrick.version ? null : current));
        if (isLastTrick) {
          setShowFinalResult(true);
        }
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
      delay: 1.0,
      stagger: 0.03,
      ease: 'power3.inOut',
    });

    return () => {
      timeline.kill();
    };
  }, [capturingTrick, state.status]);

  function closeScoreStats() {
    if (scoreStatsKey) {
      setOpenScoreStatsKey(null);
    }
  }

  function openScoreStats() {
    if (scoreStatsKey) {
      setOpenScoreStatsKey(scoreStatsKey);
    }
  }

  return (
    <main className={`game-shell ${localMode ? 'game-shell--local' : 'game-shell--online'}`}>
      {swapNotification ? (
        <div className="swap-notification" role="status" aria-live="polite">
          {swapNotification}
        </div>
      ) : null}          {fourPlayer ? (
        <section className="table-area table-area--4p" aria-label="Mesa de juego" ref={tableAreaRef}>
          <div
            className={`turn-indicator-4p`}
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
                {state.abandonedPlayerIds.length > 0 ? 'Partida interrumpida' : 'Esperando…'}
              </span>
            )}
          </div>
          <div className="seat-4p seat-4p--top" data-seat="2">
            {gridPositions
              .filter((p) => p.position === 'across')
              .map((p) =>
                renderFourPlayerSeat({
                  player: p.player,
                  side: 'top',
                  active: state.currentPlayerId === p.player.id,
                  stale: p.player.isStale(now, ABANDONMENT_GRACE_MS),
                }),
              )}
          </div>

          <div className="seat-4p seat-4p--left" data-seat="1">
            {gridPositions
              .filter((p) => p.position === 'left')
              .map((p) =>
                renderFourPlayerSeat({
                  player: p.player,
                  side: 'left',
                  active: state.currentPlayerId === p.player.id,
                  stale: p.player.isStale(now, ABANDONMENT_GRACE_MS),
                }),
              )}
          </div>

          <div className="seat-4p seat-4p--right" data-seat="3">
            {gridPositions
              .filter((p) => p.position === 'right')
              .map((p) =>
                renderFourPlayerSeat({
                  player: p.player,
                  side: 'right',
                  active: state.currentPlayerId === p.player.id,
                  stale: p.player.isStale(now, ABANDONMENT_GRACE_MS),
                }),
              )}
          </div>

          <div className="trick-center-4p" aria-label="Baza actual" ref={trickZoneRef}>
            {displayedPlays.length === 0 ? <p className="trick-empty-hint">La baza está vacía.</p> : null}
            {capturingTrick ? <p className="trick-winner-label">Baza para {playerName(state, capturingTrick.winnerId)}</p> : null}
            {displayedPlays.map((play) => (
              <div
                key={`${capturingTrick?.version ?? 'current'}-${play.playerId}-${play.card.id}`}
                className={`played-card played-card--4p ${capturingTrick ? 'played-card--capturing' : ''} ${
                  state.currentPlayerId === play.playerId ? 'is-active' : ''
                }`}
                data-play-key={playKeyFor(play)}
                title={playerName(state, play.playerId)}
              >
                <CardView card={play.card} label={`${playerName(state, play.playerId)} jugó ${play.card.toString()}`} />
              </div>
            ))}
          </div>

          {state.trumpCard ? (
            <div className="trump-peek-4p" aria-hidden="true">
              <CardView card={state.trumpCard} label={`Triunfo: ${state.trumpCard.toString()}`} />
            </div>
          ) : null}

          <section
            className={`seat-4p seat-4p--bottom ${state.currentPlayerId === viewPlayer.id ? 'is-active' : ''}`}
            aria-label={`Mano de ${viewPlayer.displayName}`}
            data-player-target={viewPlayer.id}
          >
            <div className="owner-hand-4p">
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

        {state.status === GameStatus.Ended && showFinalResult ? (
          <section className="final-result-card panel" aria-live="polite" aria-label="Resultado final">
            <p className="eyebrow">Resultado final</p>
            <h2>{resultText}</h2>
            <dl>
              {finalScores.map((row) => (
                <div key={row.ownerId} className={row.winning ? 'is-winner' : ''}>
                  <dt>{row.label}</dt>
                  <dd>{row.score} pts</dd>
                </div>
              ))}
            </dl>
            <div className="final-result-actions">
              <button type="button" onClick={openScoreStats}>
                Ver grafica
              </button>
              <button type="button" className="secondary" disabled={busy || Boolean(capturingTrick)} onClick={() => void onReset()}>
                Nueva ronda
              </button>
              <button type="button" className="secondary" onClick={onLeave}>
                Menú
              </button>
            </div>
          </section>
        ) : null}

        <div className="opponent-row">
          {opponents.map((player) => (
            <OpponentHand key={player.id} player={player} active={state.currentPlayerId === player.id} />
          ))}
        </div>

        <div className="table-center">
          <div className="trick-zone" aria-label="Baza actual" ref={trickZoneRef}>
            {displayedPlays.length === 0 ? <p>La baza está vacía.</p> : null}
            {capturingTrick ? <p className="trick-winner-label">Baza para {playerName(state, capturingTrick.winnerId)}</p> : null}
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

      {state.status === GameStatus.Ended && scoreStatsOpen ? (
        <div
          className="score-modal-backdrop"
          onPointerDown={(event) => event.target === event.currentTarget && closeScoreStats()}
        >
          <div className="score-modal panel" role="dialog" aria-modal="true" aria-labelledby="score-evolution-title">
            <button type="button" className="score-modal__close" onClick={closeScoreStats} aria-label="Cerrar estadisticas">
              Cerrar
            </button>
            <ScoreEvolutionChart state={state} />
          </div>
        </div>
      ) : null}

      <div
        className={`scoreboard-drawer ${scoreboardOpen ? 'scoreboard-drawer--open' : ''}`}
        ref={scoreboardDrawerRef}
      >
        <button
          type="button"
          className="scoreboard-tab"
          aria-controls="scoreboard-drawer-panel"
          aria-expanded={scoreboardOpen}
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

function ScoreEvolutionChart({ state }: { readonly state: GameState }) {
  const history = state.scoreHistory.length > 0 ? state.scoreHistory : [{ trickIndex: 0, scores: state.scores }];
  const ownerIds = scoreOwnerIds(state, history);
  const maxIndex = Math.max(...history.map((entry) => entry.trickIndex), 1);
  const maxScore = Math.max(120, ...history.flatMap((entry) => ownerIds.map((ownerId) => entry.scores[ownerId] ?? 0)));
  const bounds = { left: 58, top: 24, width: 560, height: 220 };
  const yTicks = [0, 30, 60, 90, 120].filter((tick) => tick <= maxScore);
  const finalEntry = history.at(-1);
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
    <section className="score-evolution" aria-labelledby="score-evolution-title">
      <div className="score-evolution__heading">
        <div>
          <p className="eyebrow">Estadisticas</p>
          <h2 id="score-evolution-title">Evolucion acumulada</h2>
        </div>
      </div>
      <svg className="score-chart" viewBox="0 0 820 320" role="img" aria-label="Grafica de puntuacion acumulada por baza">
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
            <g key={ownerId}>
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

  return Array.from(playerArea.querySelectorAll<HTMLElement>('.mini-hand > .card-back')).at(-1) ?? null;
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

function renderFourPlayerSeat(params: {
  readonly player: Player;
  readonly side: 'top' | 'left' | 'right';
  readonly active: boolean;
  readonly stale: boolean;
}): JSX.Element {
  const { player, side, active, stale } = params;
  return (
    <div
      className={[
        'seat-4p__inner',
        `seat-4p__inner--${side}`,
        active ? 'is-active' : '',
        player.abandonedAt !== null ? 'is-abandoned' : stale ? 'is-stale' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-player-target={player.id}
      aria-label={`Mano oculta de ${player.displayName}`}
    >
      <div className="seat-4p__name">{player.displayName}</div>
      <div className="mini-hand" aria-label={`${player.hand.size} cartas ocultas`}>
        {Array.from({ length: player.hand.size }, (_, index) => (
          <CardView key={index} hidden />
        ))}
      </div>
      {player.abandonedAt !== null ? (
        <span className="seat-4p__badge">Abandonó</span>
      ) : stale ? (
        <span className="seat-4p__badge seat-4p__badge--warn">Desconectado…</span>
      ) : null}
    </div>
  );
}
