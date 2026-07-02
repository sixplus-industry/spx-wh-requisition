# SPX WH Requisition

A Next.js TypeScript PWA for SPX warehouse requisitions. It uses secure server-side API routes for Google OAuth and Google Drive operations.

## Features

- Pixel-matched requisition layout: requester information, accessory request, transaction list, filters, and bilingual labels.
- Google OAuth login with encrypted HTTP-only session cookies.
- Google Drive Excel import from `.xlsx`, `.xls`, and native Google Sheets.
- Excel template export to Drive.
- Line/station/transaction data save to Drive as JSON or XLSX.
- PWA manifest, installable icon, and service worker for offline shell caching.
- Vercel-ready configuration and environment-variable based secrets.

## Environment variables

Set these in Vercel Project Settings > Environment Variables:

```bash
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://spx-wh-requisition-your-team.vercel.app/api/auth/callback/google
GOOGLE_SHEET_ID=your-new-native-google-sheet-id
SESSION_SECRET=replace-with-at-least-32-random-characters
NEXT_PUBLIC_APP_URL=https://spx-wh-requisition-your-team.vercel.app
NEXT_PUBLIC_APP_NAME=SPX WH Requisition
TRANSACTION_DELETE_USER=replace-with-new-delete-username
TRANSACTION_DELETE_PASSWORD=replace-with-new-delete-password
```

For local development, use `http://localhost:3000/api/auth/callback/google` as the redirect URI.

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable Google Drive API.
3. Configure OAuth consent screen.
4. Create OAuth Client ID > Web application.
5. Add authorized redirect URIs for local and the new Vercel project only.
6. Create or choose a separate Google Sheet for the new project and set `GOOGLE_SHEET_ID` to that new sheet ID.
7. Add the env vars above to the new Vercel project.

Requested scopes:

- `openid email profile`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive.readonly`

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel link
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add GOOGLE_REDIRECT_URI production
vercel env add GOOGLE_SHEET_ID production
vercel env add SESSION_SECRET production
vercel env add TRANSACTION_DELETE_USER production
vercel env add TRANSACTION_DELETE_PASSWORD production
vercel --prod
```

## Important API routes

- `GET /api/auth/login` starts Google OAuth.
- `GET /api/auth/callback/google` exchanges the auth code and sets the encrypted session cookie.
- `GET /api/auth/me` returns the signed-in profile.
- `POST /api/auth/logout` clears the session cookie.
- `GET /api/drive/files` lists Excel files from Drive.
- `POST /api/drive/import` imports and parses an Excel file from Drive.
- `POST /api/drive/export-template` uploads an Excel template to Drive.
- `POST /api/drive/save-data` uploads line/station/transaction data as JSON or XLSX.
