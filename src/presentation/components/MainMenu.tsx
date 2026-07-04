import { useState } from 'react';
import type { OpenGameSummary } from '../../application/ports/GameRepository';
import { GameVariant } from '../../domain/game/Types';
import { StatusBanner } from './StatusBanner';

interface MainMenuProps {
  readonly firebaseConfigured: boolean;
  readonly busy: boolean;
  readonly openGames: readonly OpenGameSummary[];
  readonly message?: string | null;
  readonly onCreateOnline: (displayName: string, variant: GameVariant) => Promise<void>;
  readonly onJoinOnline: (displayName: string, gameId: string) => Promise<void>;
  readonly onStartLocal: (displayName: string, variant: GameVariant) => Promise<void>;
}

export function MainMenu({
  firebaseConfigured,
  busy,
  openGames,
  message,
  onCreateOnline,
  onJoinOnline,
  onStartLocal,
}: MainMenuProps) {
  const [displayName, setDisplayName] = useState('Jugador');
  const [roomCode, setRoomCode] = useState('');
  const [variant, setVariant] = useState(GameVariant.Standard2P);

  return (
    <main className="menu-shell">
      <section className="hero-card">
        <h1>Briscas</h1>
        <p className="eyebrow">Barajas Espanolas</p>
        <p>
          Juega una partida de Briscas estándar en el navegador, reta a la IA o crea una sala online con amigos.
        </p>
      </section>

      <section className="panel menu-panel" aria-label="Menú principal">
        <StatusBanner message={message} tone="error" />
        <label>
          Tu nombre
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={24} />
        </label>
        <label>
          Variante
          <select value={variant} onChange={(event) => setVariant(event.target.value as GameVariant)}>
            <option value={GameVariant.Standard2P}>Briscas 2 jugadores</option>
            <option value={GameVariant.Standard4P}>Briscas 4 jugadores por equipos</option>
            <option value={GameVariant.NoSwap}>2 jugadores sin intercambio del siete</option>
          </select>
        </label>

        <div className="button-grid">
          <button type="button" disabled={busy} onClick={() => onStartLocal(displayName, variant)}>
            Jugar contra IA
          </button>
          <button
            type="button"
            disabled={busy || !firebaseConfigured}
            onClick={() => onCreateOnline(displayName, variant)}
          >
            Crear sala online
          </button>
        </div>

        {!firebaseConfigured ? (
          <p className="hint">El modo online no está configurado. Copia `.env.example` a `.env` para activarlo.</p>
        ) : null}

        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onJoinOnline(displayName, roomCode.trim().toUpperCase());
          }}
        >
          <label>
            Código de sala
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="ABC123" />
          </label>
          <button type="submit" disabled={busy || !firebaseConfigured || roomCode.trim().length === 0}>
            Unirse online
          </button>
        </form>

        {firebaseConfigured ? (
          <section className="open-rooms" aria-label="Mesas abiertas">
            <div className="open-rooms__header">
              <div>
                <p className="eyebrow">Mesas abiertas</p>
                <h2>Esperando jugadores</h2>
              </div>
              <small>{openGames.length} disponibles</small>
            </div>
            {openGames.length === 0 ? (
              <p className="hint">No hay mesas esperando ahora. Crea una sala online para aparecer aquí.</p>
            ) : (
              <ul className="open-room-list">
                {openGames.map((room) => (
                  <li key={room.gameId} className="open-room-card">
                    <div>
                      <strong>{room.gameId}</strong>
                      <span>{room.hostDisplayName}</span>
                    </div>
                    <div>
                      <span>{variantLabel(room.variant)}</span>
                      <small>
                        {room.playerCount}/{room.maxPlayers} jugadores - {createdAtLabel(room.createdAt)}
                      </small>
                    </div>
                    <button type="button" disabled={busy} onClick={() => onJoinOnline(displayName, room.gameId)}>
                      Unirse
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}

function variantLabel(variant: GameVariant): string {
  if (variant === GameVariant.Standard4P) {
    return '4 jugadores';
  }

  if (variant === GameVariant.NoSwap) {
    return '2 sin intercambio';
  }

  return '2 jugadores';
}

function createdAtLabel(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
