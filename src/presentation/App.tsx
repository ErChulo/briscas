import { GameStatus } from '../domain/game/Types';
import { GameBoard } from './components/GameBoard';
import { Lobby } from './components/Lobby';
import { MainMenu } from './components/MainMenu';
import { useGameController } from './hooks/useGameController';

export function App() {
  const controller = useGameController();

  if (!controller.state || controller.mode === 'menu') {
    return (
      <MainMenu
        firebaseConfigured={controller.firebaseConfigured}
        busy={controller.busy}
        message={controller.message}
        onCreateOnline={controller.createOnline}
        onJoinOnline={controller.joinOnline}
        onStartLocal={controller.startLocal}
      />
    );
  }

  if (controller.state.status === GameStatus.Waiting) {
    return (
      <Lobby
        state={controller.state}
        playerId={controller.currentPlayer.id}
        busy={controller.busy}
        message={controller.message}
        onStart={controller.startGame}
        onLeave={controller.leaveGame}
      />
    );
  }

  return (
    <GameBoard
      state={controller.state}
      viewPlayerId={controller.viewPlayerId}
      localMode={controller.mode === 'local'}
      busy={controller.busy}
      message={controller.message}
      onChangeViewPlayer={controller.setViewPlayerId}
      onPlayCard={controller.playCard}
      onSwapSeven={controller.swapSeven}
      onReset={controller.resetGame}
      onLeave={controller.leaveGame}
    />
  );
}
