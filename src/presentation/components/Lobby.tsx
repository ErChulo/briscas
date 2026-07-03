import { GameStatus } from '../../domain/game/Types';
import type { GameState } from '../../domain/game/GameState';
import { StatusBanner } from './StatusBanner';

interface LobbyProps {
  readonly state: GameState;
  readonly playerId: string;
  readonly busy: boolean;
  readonly message?: string | null;
  readonly onStart: () => Promise<void>;
  readonly onLeave: () => void;
}

export function Lobby({ state, playerId, busy, message, onStart, onLeave }: LobbyProps) {
  const isHost = state.hostPlayerId === playerId;
  const maxPlayers = state.variant === 'STANDARD_4P' ? 4 : 2;
  const canStart = isHost && state.status === GameStatus.Waiting && state.players.length === maxPlayers;

  return (
    <main className="lobby-shell">
      <section className="panel lobby-card">
        <p className="eyebrow">Sala</p>
        <h1>{state.gameId}</h1>
        <p>Comparte este código para que otros jugadores se unan.</p>
        <StatusBanner message={message} tone="error" />
        <h2>Jugadores</h2>
        <ul className="player-list">
          {state.players.map((player) => (
            <li key={player.id} className={player.id === playerId ? 'is-local' : ''}>
              <span>{player.displayName}</span>
              <small>Asiento {player.seatIndex + 1}</small>
            </li>
          ))}
        </ul>
        <p>
          Esperando {state.players.length}/{maxPlayers} jugadores.
        </p>
        <div className="button-grid">
          <button type="button" disabled={!canStart || busy} onClick={() => void onStart()}>
            Iniciar partida
          </button>
          <button type="button" className="secondary" onClick={onLeave}>
            Volver al menú
          </button>
        </div>
      </section>
    </main>
  );
}
