import { BriscasRules } from '../../domain/rules/BriscasRules';
import { GameStatus } from '../../domain/game/Types';
import type { GameState } from '../../domain/game/GameState';
import type { Player } from '../../domain/game/Player';
import { CardView } from './CardView';
import { Scoreboard } from './Scoreboard';
import { StatusBanner } from './StatusBanner';

interface GameBoardProps {
  readonly state: GameState;
  readonly viewPlayerId: string;
  readonly localMode: boolean;
  readonly busy: boolean;
  readonly message?: string | null;
  readonly onChangeViewPlayer: (playerId: string) => void;
  readonly onPlayCard: (cardId: string) => Promise<void>;
  readonly onSwapSeven: () => Promise<void>;
  readonly onReset: () => Promise<void>;
  readonly onLeave: () => void;
}

const rules = new BriscasRules();

export function GameBoard({
  state,
  viewPlayerId,
  localMode,
  busy,
  message,
  onChangeViewPlayer,
  onPlayCard,
  onSwapSeven,
  onReset,
  onLeave,
}: GameBoardProps) {
  const viewPlayer = state.players.find((player) => player.id === viewPlayerId) ?? state.players[0];
  const opponents = state.players.filter((player) => player.id !== viewPlayer.id);
  const activePlayerName = state.players.find((player) => player.id === state.currentPlayerId)?.displayName ?? 'Nadie';
  const canSwapSeven = rules.canSwapSeven(state, viewPlayer.id).valid;
  const resultText = state.status === GameStatus.Ended ? resultLabel(state) : null;

  return (
    <main className="game-shell">
      <section className="table-area" aria-label="Mesa de juego">
        <header className="game-topbar panel">
          <div>
            <p className="eyebrow">Sala {state.gameId}</p>
            <h1>{state.status === GameStatus.Ended ? 'Partida terminada' : `Turno: ${activePlayerName}`}</h1>
          </div>
          {localMode ? (
            <label>
              Vista local
              <select value={viewPlayer.id} onChange={(event) => onChangeViewPlayer(event.target.value)}>
                {state.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName}
                  </option>
                ))}
              </select>
            </label>
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
          <div className="trick-zone" aria-label="Baza actual">
            {state.currentTrick.plays.length === 0 ? <p>La baza está vacía.</p> : null}
            {state.currentTrick.plays.map((play) => (
              <div key={`${play.playerId}-${play.card.id}`} className="played-card">
                <CardView card={play.card} label={`${playerName(state, play.playerId)} jugó ${play.card.toString()}`} />
                <span>{playerName(state, play.playerId)}</span>
              </div>
            ))}
          </div>

          <div className="stock-zone panel" aria-label="Mazo y triunfo">
            <div>
              <span className="stock-count">{state.deck.count}</span>
              <small>cartas en mazo</small>
            </div>
            {state.trumpCard ? (
              <div>
                <p>Triunfo</p>
                <CardView card={state.trumpCard} />
              </div>
            ) : (
              <p>Sin triunfo visible</p>
            )}
          </div>
        </div>

        <section className="hand-panel panel" aria-label={`Mano de ${viewPlayer.displayName}`}>
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
                  disabled={busy || !validation.valid}
                  onClick={() => void onPlayCard(card.id)}
                />
              );
            })}
          </div>
          <div className="button-grid compact">
            <button type="button" disabled={busy || !canSwapSeven} onClick={() => void onSwapSeven()}>
              Intercambiar siete
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void onReset()}>
              Nueva ronda
            </button>
            <button type="button" className="secondary" onClick={onLeave}>
              Menú
            </button>
          </div>
        </section>
      </section>

      <Scoreboard state={state} />
    </main>
  );
}

function OpponentHand({ player, active }: { readonly player: Player; readonly active: boolean }) {
  return (
    <div className={`opponent-hand panel ${active ? 'is-active' : ''}`}>
      <strong>{player.displayName}</strong>
      <div className="mini-hand" aria-label={`${player.hand.size} cartas ocultas`}>
        {Array.from({ length: player.hand.size }, (_, index) => (
          <CardView key={index} hidden />
        ))}
      </div>
    </div>
  );
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
