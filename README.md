# Attendly

Attendly is a static-only attendance dashboard built with React, Vite, TypeScript, and Tailwind CSS. There is no app backend, no database server, and no runtime API layer. The app loads a CSV student roster from a public Hugging Face file (or a local static file), tracks attendance in the browser, and exports the attendance data as CSV.

## Static architecture

- React + Vite + TypeScript
- Tailwind CSS
- GitHub Pages deployment
- GitHub OAuth device flow in the browser
- Hugging Face CSV sync via direct static file URLs
- GitHub Actions automation for issue parsing and export workflows

## Important rule

This project is intentionally designed without a backend for the app itself. All interactive logic runs in the browser, and any automation that reaches GitHub or Hugging Face happens in GitHub Actions outside of the site runtime.

## Local development

```bash
npm install
npm run dev
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Then update:

- `VITE_GITHUB_CLIENT_ID` with your GitHub OAuth app client ID
- `VITE_HF_CSV_URL` with the public CSV URL for the student roster
- `VITE_HF_REPO` with the Hugging Face repo name if you want to reference it later

## Deployment

The app is configured for GitHub Pages with:

```bash
npm run deploy
```

The workflow files in `.github/workflows/` handle deployment and issue parsing automatically without requiring a server-side app.
