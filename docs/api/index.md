# API Reference

The public domain and application classes include TSDoc comments. Generate TypeDoc output with:

```bash
npm run docs:api
```

The most important entry points are:

- `GameEngine`: Pure orchestration of create, join, start, play, swap, finish, and reset transitions.
- `BriscasRules`: Legal move and variant checks.
- `StandardTrickResolver`: Trick winner strategy.
- `StandardScoringService`: Trick and round scoring.
- `GameRepository`: Persistence port for Firestore and in-memory implementations.
- Application use cases in `src/application/use-cases/`.
