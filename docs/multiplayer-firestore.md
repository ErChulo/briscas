# Firestore Multiplayer

## Collections

```text
games/{gameId}
  status
  createdAt
  updatedAt
  hostPlayerId
  players
  playerIds
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
2. Read player documents only for old rooms that do not yet have embedded players.
3. Rehydrate `GameState` from the game snapshot with `GameStateMapper`.
4. Validate the command through `GameEngine` and `BriscasRules`.
5. Write the new game document.
6. Create any newly joined player document.
7. Append a move document.

Firestore retries transactions on concurrent edits, so two clients attempting the same turn converge on one accepted transition.

Player subdocuments are retained for participation checks, waiting-room compatibility, and old rooms that do not yet have embedded players. Normal gameplay no longer rewrites every player subdocument on every card play.

## Client Validation And Server Rules

The client validates every move before writing. `firestore.rules` provides a baseline that requires authentication and room participation. Production hardening should move hidden-state and authoritative validation into Cloud Functions.

## Reconnect And Refresh

The presentation hook subscribes to the game document with `onSnapshot` and maps that snapshot directly into `GameState`. Refreshing an online room can restore state by joining or subscribing to the same room code. Old rooms without embedded players fall back to loading player documents.

## Secrecy Limitation

Because this is client-only Firebase, the active client must be able to reconstruct the full state to deal, draw, and validate. The UI does not reveal opponent cards, but Firestore participants can read them unless stricter server logic is added. The repository boundary allows replacing this with Cloud Functions later.
