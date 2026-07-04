import { Card } from '../cards/Card';
import { GameStatus, GameVariant, type PlayerId } from '../game/Types';
import type { GameState } from '../game/GameState';
import type { RulesEngine, TrumpSwapRank } from './RulesEngine';
import { invalidResult, validResult, type ValidationResult } from './ValidationResult';

/** Standard Briscas rule set with replaceable variant behavior. */
export class BriscasRules implements RulesEngine {
  public canJoin(state: GameState, playerId: PlayerId): ValidationResult {
    if (state.status !== GameStatus.Waiting) {
      return invalidResult('La partida ya empezó.');
    }

    if (state.players.some((player) => player.id === playerId)) {
      return invalidResult('Este jugador ya está en la sala.');
    }

    if (state.players.length >= this.maxPlayers(state)) {
      return invalidResult('La sala está llena.');
    }

    return validResult;
  }

  public canStart(state: GameState, playerId: PlayerId): ValidationResult {
    if (state.status !== GameStatus.Waiting) {
      return invalidResult('La partida no está en la sala de espera.');
    }

    if (state.hostPlayerId !== playerId) {
      return invalidResult('Solo el anfitrión puede iniciar la partida.');
    }

    if (state.players.length !== this.maxPlayers(state)) {
      return invalidResult(`Se necesitan ${this.maxPlayers(state)} jugadores.`);
    }

    return validResult;
  }

  public canPlayCard(state: GameState, playerId: PlayerId, card: Card): ValidationResult {
    if (state.status !== GameStatus.Playing) {
      return invalidResult('La partida no está activa.');
    }

    if (state.currentPlayerId !== playerId) {
      return invalidResult('No es tu turno.');
    }

    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return invalidResult('El jugador no existe en la partida.');
    }

    if (!player.hand.has(card)) {
      return invalidResult('La carta no está en tu mano.');
    }

    if (state.currentTrick.hasPlayed(playerId)) {
      return invalidResult('Ya jugaste una carta en esta baza.');
    }

    return validResult;
  }

  public canSwapTrump(state: GameState, playerId: PlayerId, exchangeRank: TrumpSwapRank): ValidationResult {
    if (state.variant === GameVariant.NoSwap) {
      return invalidResult('El intercambio está desactivado.');
    }

    if (state.status !== GameStatus.Playing) {
      return invalidResult('La partida no está activa.');
    }

    if (state.currentPlayerId !== playerId) {
      return invalidResult('Solo puedes intercambiar antes de jugar en tu turno.');
    }

    if (state.currentTrick.hasPlayed(playerId)) {
      return invalidResult('Ya jugaste una carta en esta baza.');
    }

    if (state.trumpExchangeUsed) {
      return invalidResult('El intercambio ya se usó en esta ronda.');
    }

    if (exchangeRank === 2 && !this.isInitialTrick(state)) {
      return invalidResult('El intercambio del dos solo está disponible al inicio.');
    }

    if (!state.trumpCard || !state.trumpCard.suit || state.deck.isEmpty) {
      return invalidResult('No hay triunfo disponible para intercambiar.');
    }

    const exchangeCard = new Card(state.trumpCard.suit, exchangeRank);
    const player = state.players.find((candidate) => candidate.id === playerId);

    if (!player?.hand.has(exchangeCard)) {
      return invalidResult(`Necesitas tener el ${exchangeRank === 7 ? 'siete' : 'dos'} del palo de triunfo.`);
    }

    if (state.trumpCard.captureStrength >= exchangeCard.captureStrength) {
      return invalidResult('El intercambio solo está disponible si el triunfo visible es mejor.');
    }

    return validResult;
  }

  public canSwapSeven(state: GameState, playerId: PlayerId): ValidationResult {
    return this.canSwapTrump(state, playerId, 7);
  }

  public isGameOver(state: GameState): boolean {
    return state.deck.isEmpty && state.currentTrick.isEmpty && state.players.every((player) => player.hand.size === 0);
  }

  public maxPlayers(state: GameState): number {
    return state.variant === GameVariant.Standard4P ? 4 : 2;
  }

  private isInitialTrick(state: GameState): boolean {
    return state.lastCompletedTrick === null && state.currentTrick.plays.length === 0;
  }
}
