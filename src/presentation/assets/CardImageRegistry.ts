import type { Card } from '../../domain/cards/Card';

const cardImageModules = import.meta.glob<string>('../../assets/cards/*.{PNG,png}', {
  eager: true,
  import: 'default',
  query: '?url',
});

const cardImagesByFileName = new Map(
  Object.entries(cardImageModules).map(([path, url]) => [(path.split('/').at(-1) ?? path).toLowerCase(), url]),
);

/** Maps domain cards to the normalized PNG files copied from imagenes-cartas/. */
export class CardImageRegistry {
  public static getImage(card: Card): string {
    const fileName = `${card.suit}-${card.rank}.png`;
    const image = cardImagesByFileName.get(fileName);

    if (!image) {
      throw new Error(`Missing card image: ${fileName}`);
    }

    return image;
  }
}
