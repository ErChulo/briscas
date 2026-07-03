# SOLID Principles

## Single Responsibility

- `Card` owns card value behavior.
- `Deck` owns drawing and trump-card replacement.
- `Dealer` owns initial dealing.
- `BriscasRules` owns legal-move checks.
- `StandardTrickResolver` owns trick winner resolution.
- `StandardScoringService` owns scoring.
- Use cases own application workflows.
- Repositories own persistence.

## Open/Closed

Rules, trick resolution, scoring, deck creation, authentication, and repositories are behind interfaces or focused classes. A new variant can replace `RulesEngine`, `TrickResolver`, or `ScoringService` without rewriting React components.

## Liskov Substitution

`InMemoryGameRepository` and `FirestoreGameRepository` both satisfy `GameRepository`. Use cases can run against either adapter.

## Interface Segregation

The application uses narrow ports: `GameRepository`, `AuthGateway`, `Clock`, and `IdGenerator`. No UI class receives a large god interface.

## Dependency Inversion

Use cases depend on ports, not Firestore. The domain engine depends on `RulesEngine`, `TrickResolver`, `ScoringService`, and `Dealer`, not concrete infrastructure.

## Avoiding Anemic Models

Domain objects expose behavior such as `Card.pointValue`, `Hand.remove`, `Deck.draw`, `Trick.addPlay`, and `GameEngine.playCard`. React components render state but do not implement game rules.
