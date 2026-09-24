# Attendly

Attendly is a static-only attendance dashboard built with React, Vite, TypeScript, and Tailwind CSS. There is no app backend, no database server, and no runtime API layer. The app loads a CSV student roster from a public Hugging Face file (or a local static file), tracks attendance in the browser, and exports the attendance data as CSV.

## Static architecture

- React + Vite + TypeScript
- Tailwind CSS
- GitHub Pages deployment
- PAT-based local GitHub verification in the browser
- Hugging Face CSV sync via direct static file URLs
- GitHub Actions automation for issue parsing and export workflows

## Important rule

This project is intentionally designed without a backend for the app itself. All interactive logic runs in the browser, and any automation that reaches GitHub or Hugging Face happens in GitHub Actions outside of the site runtime.

## Local development

```bash
npm install
npm run dev
```

## GitHub and Hugging Face setup

This app does not require a local `.env` file. The browser PAT flow is handled entirely on the client side, and the repo-level automation uses GitHub repository secrets and variables.

Set this in GitHub:

- `HF_API` = your Hugging Face API token

The Hugging Face dataset repo is fixed to the user account repo: `soumyadipk03/attendly`.

No `OAUTH_CLIENTID` secret is required for this static-only setup.

## Deployment

The app is configured for GitHub Pages with:

```bash
npm run deploy
```

The workflow files in `.github/workflows/` handle deployment and issue parsing automatically without requiring a server-side app.
