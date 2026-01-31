# Script Seance

Script Seance is an AI-powered screenwriting and storytelling assistant designed to help writers generate scenes, dialogue, and plot twists using Google's Gemini AI.

## Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **AI Integration**: [Google GenAI SDK](https://www.npmjs.com/package/@google/genai)
- **Icons**: [Lucide React](https://lucide.dev/)

## Configuration & Secrets

To run this application, you need to configure your environment variables for the Google Gemini API.

1.  Create a file named `.env` in the root directory of the project.
2.  Add the following variable to the file:

```bash
GEMINI_API_KEY=your_google_ai_studio_api_key_here
```

## Production prerequisites

- Server-side proxy for all Gemini/AI calls (no client-exposed keys).
- Authentication and rate limiting on AI endpoints.
- Request timeouts and retry handling.
- CSP and security headers at the edge.

## Installation & Run Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [pnpm](https://pnpm.io/) (install via Corepack or package manager of choice)

### Installation

Install the dependencies:

```bash
pnpm install
```

### Running the App

Start the API server (used for Gemini calls):

```bash
pnpm run server
```

Start the Vite development server:

```bash
pnpm run dev
```

The API server runs on `http://localhost:3001` and the app will typically start at `http://localhost:3000`.

## Deployment (Production)

This project ships a static client plus a Node API server. In production, serve the `dist/` output and reverse-proxy `/api` to the Node server so the client and API share the same origin.

1. Build the client:

```bash
pnpm run build
```

2. Start the API server with required env vars:

```bash
ADMIN_PASSWORD=your_admin_password \
GEMINI_API_KEY=your_google_ai_studio_api_key_here \
PORT=3001 \
node server/index.js
```

3. Serve `dist/` from your web server and proxy `/api` to the API server.

Example Nginx location block:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Security Headers & CSP

Apply security headers at your edge (CDN/reverse proxy/static host). Below is a recommended baseline for the client app.

Recommended CSP (adjust `connect-src` if the API is on a separate origin):

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; upgrade-insecure-requests
```

Suggested security headers:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Resource-Policy: same-origin
```
