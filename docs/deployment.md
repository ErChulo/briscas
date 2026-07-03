# Deployment

## Vercel

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Set environment variables from `.env.example`.
4. Use build command `npm run build`.
5. Use output directory `dist`.

`vercel.json` already contains the build settings.

## Netlify

1. Create a new Netlify site from GitHub.
2. Set environment variables from `.env.example`.
3. Build command: `npm run build`.
4. Publish directory: `dist`.

`netlify.toml` includes the SPA redirect.

## GitHub Pages

The workflow `.github/workflows/pages.yml` builds tests, app, and docs. It publishes the app at the project root and docs under `/docs/`.

Repository settings required:

1. Go to Settings > Pages.
2. Set Source to GitHub Actions.
3. Push to `main` or run the workflow manually.

## Static Documentation

Build docs locally:

```bash
npm run docs:build
```

Preview docs locally:

```bash
npm run docs:preview
```

## Firebase Rules

Deploy `firestore.rules` with Firebase CLI or paste it into the Firebase console. The baseline assumes Firebase Auth is enabled.
