# UML Diagrams

## Domain Class Diagram

```mermaid
classDiagram
  class Card {
    +Suit suit
    +Rank rank
    +pointValue number
    +captureStrength number
    +isTrump(Suit) boolean
  }
  class Deck {
    +count number
    +trumpCard Card
    +draw() DrawResult
    +replaceTrumpCard(Card) Deck
  }
  class Hand {
    +size number
    +has(Card) boolean
    +add(Card) Hand
    +remove(Card) Hand
  }
  class Player {
    +id PlayerId
    +displayName string
    +seatIndex number
    +hand Hand
    +teamId TeamId
  }
  class Team {
    +id TeamId
    +playerIds PlayerId[]
  }
  class Trick {
    +leadPlayerId PlayerId
    +plays PlayedCard[]
    +addPlay(PlayerId, Card) Trick
  }
  class GameState {
    +status GameStatus
    +players Player[]
    +deck Deck
    +currentTrick Trick
    +scores Record
  }
  class BriscasRules
  class TrickResolver
  class ScoringService
  class Dealer
  class GameEngine
  Deck "1" o-- "many" Card
  Hand "1" o-- "many" Card
  Player "1" o-- "1" Hand
  Team "1" o-- "many" Player
  Trick "1" o-- "many" Card
  GameState "1" o-- "many" Player
  GameState "1" o-- "1" Deck
  GameState "1" o-- "1" Trick
  GameEngine --> BriscasRules
  GameEngine --> TrickResolver
  GameEngine --> ScoringService
  GameEngine --> Dealer
```

## Player Plays A Card

```mermaid
sequenceDiagram
  participant UI as React GameBoard
  participant UC as PlayCardUseCase
  participant Repo as GameRepository
  participant Engine as GameEngine
  participant Rules as BriscasRules
  participant Resolver as TrickResolver
  UI->>UC: execute(gameId, playerId, cardId)
  UC->>Repo: runTransaction(gameId)
  Repo->>Engine: playCard(state, playerId, card)
  Engine->>Rules: canPlayCard(state, playerId, card)
  Rules-->>Engine: valid
  alt trick complete
    Engine->>Resolver: resolveWinner(trick, trumpSuit)
    Engine->>Engine: score and draw winner first
  end
  Engine-->>Repo: next GameState
  Repo->>Repo: write game, players, move
  Repo-->>UC: persisted update
  UC-->>UI: next GameState
```

## Create Join Start

```mermaid
sequenceDiagram
  participant Host
  participant Create as CreateGameUseCase
  participant Join as JoinGameUseCase
  participant Start as StartGameUseCase
  participant Repo as GameRepository
  participant Engine as GameEngine
  Host->>Create: create room
  Create->>Engine: createGame()
  Create->>Repo: createGame(snapshot)
  participant Guest
  Guest->>Join: join room code
  Join->>Repo: runTransaction()
  Repo->>Engine: joinGame()
  Host->>Start: start
  Start->>Repo: runTransaction()
  Repo->>Engine: startGame(seed)
  Engine->>Engine: deal 3, reveal trump
```

## Game Lifecycle

```mermaid
stateDiagram-v2
  [*] --> waiting
  waiting --> playing: host starts with full room
  playing --> playing: play card
  playing --> playing: complete trick / score / draw
  playing --> ended: deck empty and all hands empty
  ended --> waiting: reset game
  waiting --> [*]: leave room
```

## Component Dependencies

```mermaid
flowchart LR
  Presentation[Presentation React] --> Application[Application Use Cases]
  Application --> Domain[Domain Model and Rules]
  Infrastructure[Infrastructure Firebase/InMemory] --> Application
  Infrastructure --> Domain
  Presentation --> Domain
  Domain -. no imports .-> Domain
```

## Firestore Data Model

```mermaid
erDiagram
  GAMES ||--o{ PLAYERS : contains
  GAMES ||--o{ MOVES : logs
  USERS ||--o{ HISTORY : records
  GAMES {
    string gameId
    string status
    string hostPlayerId
    string currentPlayerId
    string trumpSuit
    number deckCount
    number roundNumber
    number version
  }
  PLAYERS {
    string playerId
    string displayName
    number seatIndex
    boolean connected
    array hand
    number score
    string teamId
  }
  MOVES {
    string moveId
    string playerId
    string type
    map card
    number createdAt
    number resultingVersion
  }
  USERS {
    string uid
    string displayName
    number eloRating
    number wins
    number losses
  }
  HISTORY {
    string matchId
    string result
    number finalScore
    number playedAt
  }
```
