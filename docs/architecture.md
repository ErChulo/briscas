# Architecture

The project follows four explicit layers.

## Domain Layer

Path: `src/domain/`

Pure TypeScript business logic. It contains cards, deck, hand, players, teams, trick state, scoring, rules, errors, and `GameEngine`. It imports no React, Firebase, DOM, browser storage, or network modules.

## Application Layer

Path: `src/application/`

Use cases coordinate domain transitions and persistence through ports. Examples: `CreateGameUseCase`, `JoinGameUseCase`, `StartGameUseCase`, `PlayCardUseCase`, `SwapSevenUseCase`, `FinishTrickUseCase`, `DrawCardUseCase`, and `ResetGameUseCase`.

## Infrastructure Layer

Path: `src/infrastructure/`

Adapters for Firestore, Firebase Auth, environment configuration, serialization, and in-memory persistence. The application layer depends only on the `GameRepository` and `AuthGateway` abstractions.

## Presentation Layer

Path: `src/presentation/`

React components and hooks. The UI calls application use cases and consults domain rules for validation display. It does not calculate trick winners or mutate game state directly.

## Dependency Rule

Dependencies point inward:

```text
presentation -> application -> domain
infrastructure -> application/domain
domain -> no outer layer
```

This preserves framework-agnostic rules and makes domain tests deterministic.
