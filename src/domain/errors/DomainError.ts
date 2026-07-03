/** Base class for domain and application errors rendered by the UI. */
export class BriscasError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotPlayersTurnError extends BriscasError {}

export class CardNotInHandError extends BriscasError {}

export class IllegalMoveError extends BriscasError {}

export class GameNotFoundError extends BriscasError {}

export class GameAlreadyStartedError extends BriscasError {}

export class InvalidGameStateError extends BriscasError {}

export class PlayerAlreadyJoinedError extends BriscasError {}

export class RoomFullError extends BriscasError {}
