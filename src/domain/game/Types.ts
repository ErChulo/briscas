export type GameId = string;
export type PlayerId = string;
export type TeamId = string;

export enum GameVariant {
  Standard2P = 'STANDARD_2P',
  Standard4P = 'STANDARD_4P',
  NoSwap = 'NO_SWAP',
}

export enum GameStatus {
  Waiting = 'waiting',
  Playing = 'playing',
  Ended = 'ended',
}
