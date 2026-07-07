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
  abandonedPlayerIds
  loserIds

games/{gameId}/players/{playerId}
  displayName
  seatIndex
  joinedAt through createdAt/update history
  connected
  lastSeenAt
  abandonedAt
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

## Presence And Abandonment

Without server-side Cloud Functions the client cannot rely on Firestore `onDisconnect`, so the game tracks presence through a client-emitted heartbeat.

- Each in-game client runs `HeartbeatUseCase.execute` every **12 seconds**, bumping its own `Player.lastSeenAt`.
- Any client detecting a remote `Player` whose `lastSeenAt` is older than **45 seconds** invokes `MarkPlayerAbandonedUseCase.execute`.
- `MarkPlayerAbandonedUseCase` runs through `GameRepository.runTransaction`, so two clients reacting to the same drop converge on a single `Ended` state.
- The abandonee's team (4-player mode) or the player themselves (2-player mode) is recorded in `GameState.loserIds`; the rest of the room becomes the default winner.
- Once a game is `Ended` because of abandonment, the host can `ResetGame` to start a fresh round. `resetGame` clears `abandonedPlayerIds` and `loserIds`.
- Leaving via the **Menú** button only unsubscribes the local client — the local player's `lastSeenAt` then ages out like any silent drop, so other participants quickly trigger the abandonment flow on their behalf.
- This is intentionally client-only: production hardening should move heartbeat validation and timed disconnection into a Cloud Function so a single malicious client cannot stall the room.

## Secrecy Limitation

Because this is client-only Firebase, the active client must be able to reconstruct the full state to deal, draw, and validate. The UI does not reveal opponent cards, but Firestore participants can read them unless stricter server logic is added. The repository boundary allows replacing this with Cloud Functions later.
