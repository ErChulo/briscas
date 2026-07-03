import type { PlayerId, TeamId } from './Types';

export type ScoreOwnerId = PlayerId | TeamId;

/** Scoreboard value object keyed by player id in 2P and team id in 4P. */
export class Score {
  public constructor(private readonly values: Readonly<Record<ScoreOwnerId, number>> = {}) {}

  public get(ownerId: ScoreOwnerId): number {
    return this.values[ownerId] ?? 0;
  }

  public add(ownerId: ScoreOwnerId, points: number): Score {
    return new Score({ ...this.values, [ownerId]: this.get(ownerId) + points });
  }

  public toRecord(): Readonly<Record<ScoreOwnerId, number>> {
    return { ...this.values };
  }
}
