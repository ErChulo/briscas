# Domain Model

## Cards

`Card`, `Suit`, `Rank`, `Deck`, and `Hand` model the 40-card Spanish deck.

Ranks: `1,2,3,4,5,6,7,10,11,12`.

Suits: `oro`, `copa`, `espada`, `basto`.

Point values follow the DOCX:

| Rank | Name | Points | Strength |
| --- | --- | ---: | ---: |
| 1 | As | 11 | 1 |
| 3 | Tres | 10 | 2 |
| 12 | Rey | 4 | 3 |
| 11 | Caballo | 3 | 4 |
| 10 | Sota | 2 | 5 |
| 7 | Siete | 0 | 6 |
| 6 | Seis | 0 | 7 |
| 5 | Cinco | 0 | 8 |
| 4 | Cuatro | 0 | 9 |
| 2 | Dos | 0 | 10 |

## Trick Resolution

`StandardTrickResolver` implements:

- Trump beats every non-trump card.
- Same suit is won by strongest capture rank.
- If no trump is played and the responding card does not follow the lead suit, the first card wins.
- There is no obligation to follow suit.

## Game Flow

1. Create a waiting room.
2. Join until the selected variant has enough players.
3. Start game with deterministic deck seed.
4. Deal 3 cards to each player.
5. Reveal the next card as trump and place it at the bottom of the deck.
6. Active player plays a card.
7. Each next player plays one card.
8. Resolve the trick.
9. Score captured cards to the winning player or team.
10. Winner draws first, then the rest clockwise while the deck has cards.
11. Winner leads the next trick.
12. End when deck and hands are empty.

## Seven Of Trump

`BriscasRules.canSwapSeven` controls the optional seven-of-trump exchange. It is enabled for `STANDARD_2P` and `STANDARD_4P`, disabled for `NO_SWAP`, and only valid while the trump card remains in the deck.

## Card Image Mapping

The provided files are copied unchanged into `src/assets/cards/`. `CardImageRegistry.getImage(card)` maps a domain card to `{suit}-{rank}.PNG`, for example `oro-1.PNG` or `espada-12.PNG`.
