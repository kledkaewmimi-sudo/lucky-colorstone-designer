# Lucky Colorstone Designer

A web app for designing custom bracelets with lucky color stones and LINE LIFF integration.

## How to run locally
```bash
npm install
npm run dev   # starts the Express server on PORT 8000
```

The app serves static files and exposes a REST API under `/api/*`. The frontend fetches stone data from the API.

## Deployment
- **Vercel** – commit the repo and add the environment variable `API_URL` (or rely on the `vercel.json` rewrite).
- **Netlify** – use the `_redirects` file (already included) to proxy `/api/*` to the Render backend.
- **Render** – the same Express server can be deployed directly.

## Environment variables
- `API_URL` – optional, overrides the API base URL used by the client.

## Notes
- The `data/` folder contains the seed JSON files (`stones.json`, `orders.json`, `settings.json`). They are created automatically if missing.
- The `.gitignore` excludes `node_modules`, `.env`, OS artifacts, and log files.
