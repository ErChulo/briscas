/** Round metadata kept separate from move and scoring concerns. */
export class Round {
  public constructor(
    public readonly roundNumber: number,
    public readonly dealerSeatIndex: number,
  ) {}

  public next(playerCount: number): Round {
    return new Round(this.roundNumber + 1, (this.dealerSeatIndex + 1) % playerCount);
  }
}
