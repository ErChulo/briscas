# Firestore Multiplayer

## Collections

```text
games/{gameId}
  status
  createdAt
  updatedAt
  hostPlayerId
  currentPlayerId
  trumpSuit
  trumpCard
  deck
  deckCount
  currentTrick
  lastCompletedTrick
  lastTrickWinnerId
  scores
  roundNumber
  version
  playerIds

games/{gameId}/players/{playerId}
  displayName
  seatIndex
  joinedAt through createdAt/update history
  connected
  hand
  score
  teamId

games/{gameId}/moves/{moveId}
  playerId
  type
  card
  createdAt
  resultingVersion
```

## Transaction Model

Turn-sensitive use cases call `GameRepository.runTransaction`.

1. Read `games/{gameId}`.
2. Read known `players` documents from `playerIds`.
3. Rehydrate `GameState` with `GameStateMapper`.
4. Validate the command through `GameEngine` and `BriscasRules`.
5. Write the new game document.
6. Write player documents.
7. Append a move document.

Firestore retries transactions on concurrent edits, so two clients attempting the same turn converge on one accepted transition.

## Client Validation And Server Rules

The client validates every move before writing. `firestore.rules` provides a baseline that requires authentication and room participation. Production hardening should move hidden-state and authoritative validation into Cloud Functions.

## Reconnect And Refresh

The presentation hook subscribes to the game document with `onSnapshot`. On each version update it reloads the game and player documents. Refreshing an online room can restore state by joining or subscribing to the same room code.

## Secrecy Limitation

Because this is client-only Firebase, the active client must be able to reconstruct the full state to deal, draw, and validate. The UI does not reveal opponent cards, but Firestore participants can read them unless stricter server logic is added. The repository boundary allows replacing this with Cloud Functions later.
