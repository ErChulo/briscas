import type { Card } from '../cards/Card';
import type { PlayerId } from './Types';

export enum MoveType {
  CreateGame = 'CREATE_GAME',
  JoinGame = 'JOIN_GAME',
  StartGame = 'START_GAME',
  PlayCard = 'PLAY_CARD',
  SwapSeven = 'SWAP_SEVEN',
  SwapTrump = 'SWAP_TRUMP',
  ResetGame = 'RESET_GAME',
}

/** Auditable player command written to persistence after a state transition. */
export interface Move {
  readonly id: string;
  readonly type: MoveType;
  readonly playerId: PlayerId;
  readonly card?: Card;
  readonly createdAt: number;
  readonly resultingVersion?: number;
}
