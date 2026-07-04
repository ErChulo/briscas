import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { BriscasRules } from '../../domain/rules/BriscasRules';
import { GameStatus } from '../../domain/game/Types';
import type { GameState } from '../../domain/game/GameState';
import type { Player } from '../../domain/game/Player';
import type { PlayedCard } from '../../domain/game/Trick';
import { CardView } from './CardView';
import { Scoreboard } from './Scoreboard';
import { StatusBanner } from './StatusBanner';

interface GameBoardProps {
  readonly state: GameState;
  readonly viewPlayerId: string;
  readonly localMode: boolean;
  readonly busy: boolean;
  readonly message?: string | null;
  readonly onPlayCard: (cardId: string) => Promise<void>;
  readonly onSwapSeven: () => Promise<void>;
  readonly onReset: () => Promise<void>;
  readonly onLeave: () => void;
}

const rules = new BriscasRules();

interface AnimatedTrick {
  readonly plays: readonly PlayedCard[];
  readonly winnerId: string;
  readonly version: number;
}

export function GameBoard({
  state,
  viewPlayerId,
  localMode,
  busy,
  message,
  onPlayCard,
  onSwapSeven,
  onReset,
  onLeave,
}: GameBoardProps) {
  const tableAreaRef = useRef<HTMLElement>(null);
  const trickZoneRef = useRef<HTMLDivElement>(null);
  const scoreboardDrawerRef = useRef<HTMLDivElement>(null);
  const animatedPlayKeys = useRef(new Set<string>());
  const animatedCompletedVersion = useRef<number | null>(null);
  const [capturingTrick, setCapturingTrick] = useState<AnimatedTrick | null>(null);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const viewPlayer = state.players.find((player) => player.id === viewPlayerId) ?? state.players[0];
  const opponents = state.players.filter((player) => player.id !== viewPlayer.id);
  const activePlayerName = state.players.find((player) => player.id === state.currentPlayerId)?.displayName ?? 'Nadie';
  const canSwapSeven = rules.canSwapSeven(state, viewPlayer.id).valid;
  const resultText = state.status === GameStatus.Ended ? resultLabel(state) : null;
  const displayedPlays = capturingTrick?.plays ?? state.currentTrick.plays;

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
          duration: 0.5,
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
    const target = Array.from(tableAreaRef.current.querySelectorAll<HTMLElement>('[data-player-target]')).find(
      (element) => element.dataset.playerTarget === capturingTrick.winnerId,
    );
    const targetRect = (target ?? tableAreaRef.current).getBoundingClientRect();

    const timeline = gsap.timeline({
      onComplete: () => {
        setCapturingTrick((current) => (current?.version === capturingTrick.version ? null : current));
      },
    });

    timeline.fromTo(
      elements,
      { autoAlpha: 0, scale: 0.82, y: 24, rotation: -3 },
      { autoAlpha: 1, scale: 1, y: 0, rotation: 0, duration: 0.28, stagger: 0.05, ease: 'power2.out' },
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
      duration: 0.8,
      delay: 0.22,
      stagger: 0.05,
      ease: 'power3.inOut',
    });

    return () => {
      timeline.kill();
    };
  }, [capturingTrick]);

  return (
    <main className="game-shell">
      <section className="table-area" aria-label="Mesa de juego" ref={tableAreaRef}>
        <header className="game-topbar panel">
          <div>
            <p className="eyebrow">Sala {state.gameId}</p>
            <h1>{state.status === GameStatus.Ended ? 'Partida terminada' : `Turno: ${activePlayerName}`}</h1>
          </div>
          {localMode ? (
            <p className="hint">Modo local contra IA</p>
          ) : null}
        </header>

        <StatusBanner message={message} tone="error" />
        <StatusBanner message={resultText} tone="success" />

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

          <div className="stock-zone panel" aria-label="Mazo y triunfo">
            <div className="stock-counter">
              <span className="stock-count">{state.deck.count}</span>
              <small>cartas en mazo</small>
            </div>
            <div className="stock-stack" aria-label="Mazo sobre carta de triunfo">
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
          </div>
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
                  disabled={busy || Boolean(capturingTrick) || !validation.valid}
                  onClick={() => void onPlayCard(card.id)}
                />
              );
            })}
          </div>
          <div className="button-grid compact">
            <button type="button" disabled={busy || Boolean(capturingTrick) || !canSwapSeven} onClick={() => void onSwapSeven()}>
              Intercambiar siete
            </button>
            <button type="button" className="secondary" disabled={busy || Boolean(capturingTrick)} onClick={() => void onReset()}>
              Nueva ronda
            </button>
            <button type="button" className="secondary" onClick={onLeave}>
              Menú
            </button>
          </div>
        </section>
      </section>

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
          <span>Marcador</span>
        </button>
        <div id="scoreboard-drawer-panel" className="scoreboard-drawer__panel">
          <Scoreboard state={state} />
        </div>
      </div>
    </main>
  );
}

function OpponentHand({ player, active }: { readonly player: Player; readonly active: boolean }) {
  return (
    <div className={`opponent-hand panel ${active ? 'is-active' : ''}`} data-player-target={player.id}>
      <strong>{player.displayName}</strong>
      <div className="mini-hand" aria-label={`${player.hand.size} cartas ocultas`}>
        {Array.from({ length: player.hand.size }, (_, index) => (
          <CardView key={index} hidden />
        ))}
      </div>
    </div>
  );
}

function playKeyFor(play: PlayedCard): string {
  return `${play.playerId}:${play.card.id}`;
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((player) => player.id === playerId)?.displayName ?? playerId;
}

function resultLabel(state: GameState): string {
  if (state.winnerIds.length === 0) {
    return 'Empate sin ganador declarado.';
  }

  const labels = state.winnerIds.map((winnerId) => {
    const teamPlayers = state.players.filter((player) => player.teamId === winnerId);
    if (teamPlayers.length > 0) {
      return `Equipo ${winnerId.endsWith('0') ? 'A' : 'B'}`;
    }

    return playerName(state, winnerId);
  });

  return `Ganador: ${labels.join(', ')}`;
}
