import type { GameState } from '../../domain/game/GameState';

interface ScoreboardProps {
  readonly state: GameState;
}

export function Scoreboard({ state }: ScoreboardProps) {
  const scoreRows = Object.entries(state.scores);

  return (
    <aside className="panel scoreboard" aria-label="Marcador">
      <h2>Marcador</h2>
      <dl>
        {scoreRows.map(([ownerId, score]) => (
          <div key={ownerId} className="score-row">
            <dt>{labelForOwner(state, ownerId)}</dt>
            <dd>{score} pts</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function labelForOwner(state: GameState, ownerId: string): string {
  const teamPlayers = state.players.filter((player) => player.teamId === ownerId);
  if (teamPlayers.length > 0) {
    return `Equipo ${ownerId.endsWith('0') ? 'A' : 'B'} (${teamPlayers.map((player) => player.displayName).join(', ')})`;
  }

  return state.players.find((player) => player.id === ownerId)?.displayName ?? ownerId;
}
