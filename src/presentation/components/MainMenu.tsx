import { useState } from 'react';
import { GameVariant } from '../../domain/game/Types';
import { StatusBanner } from './StatusBanner';

interface MainMenuProps {
  readonly firebaseConfigured: boolean;
  readonly busy: boolean;
  readonly message?: string | null;
  readonly onCreateOnline: (displayName: string, variant: GameVariant) => Promise<void>;
  readonly onJoinOnline: (displayName: string, gameId: string) => Promise<void>;
  readonly onStartLocal: (displayName: string, variant: GameVariant) => Promise<void>;
}

export function MainMenu({
  firebaseConfigured,
  busy,
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
        <p className="eyebrow">Baraja española · Firestore · SOLID</p>
        <h1>Briscas</h1>
        <p>
          Juega una partida de Briscas estándar en el navegador, crea una sala online o prueba las reglas en modo local.
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
            Partida local
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
          <p className="hint">Firebase no está configurado. Copia `.env.example` a `.env` para activar online.</p>
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
      </section>
    </main>
  );
}
