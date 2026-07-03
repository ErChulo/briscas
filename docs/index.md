# Briscas

Browser-based Briscas built as an object-oriented analysis exercise. The implementation uses Vite, TypeScript, React, Firebase Firestore, Vitest, and VitePress.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The app works immediately in human-vs-AI mode without online configuration.

## Firebase Setup

1. Create a Firebase project.
2. Enable Authentication with the Anonymous provider. Google sign-in is implemented in the infrastructure gateway and can be enabled if desired.
3. Enable Cloud Firestore.
4. Copy `.env.example` to `.env` and fill the public Firebase web config.
5. Deploy or paste `firestore.rules` into Firebase rules.

## Scripts

```bash
npm run dev
npm run build
npm run test:run
npm run docs:dev
npm run docs:build
npm run docs:preview
npm run docs:api
```

## What Is Implemented

- Spanish 40-card deck using the provided PNG files.
- Standard 2-player Briscas.
- 4-player team variant with seats `0/2` vs `1/3`.
- `NO_SWAP` variant that disables the seven-of-trump exchange.
- Winner-first draw phase after each completed trick.
- Firestore rooms with canonical game state, players, and move log.
- Transactional turn-sensitive updates.
- Local in-memory mode for testing rules without Firestore.
- Domain tests that do not import React, Firebase, browser storage, or network APIs.

## Rule Assumptions

The DOCX specifies no obligation to follow suit, so the implementation permits any card on response. The DOCX does not define who starts the first round; this implementation treats seat 0 as dealer and starts with the next seat, then rotates dealer on reset.

## Known Limitations

Pure client-side Firebase cannot perfectly hide all secret state while also letting clients perform authoritative transactions. The UI only displays the local hand and opponent hand counts, but participant clients can technically read persisted hands and deck data. The repository and rules abstractions are designed so sensitive transitions can later move to Cloud Functions.
