/** Valid ranks in the 40-card Spanish deck. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const RANK_LABELS: Readonly<Record<Rank, string>> = {
  1: 'As',
  2: 'Dos',
  3: 'Tres',
  4: 'Cuatro',
  5: 'Cinco',
  6: 'Seis',
  7: 'Siete',
  10: 'Sota',
  11: 'Caballo',
  12: 'Rey',
};

export function isRank(value: number): value is Rank {
  return RANKS.includes(value as Rank);
}
