import type { PlayerId, TeamId } from './Types';

/** Team abstraction for four-player Briscas. */
export class Team {
  public constructor(
    public readonly id: TeamId,
    public readonly name: string,
    public readonly playerIds: readonly PlayerId[],
  ) {}
}
