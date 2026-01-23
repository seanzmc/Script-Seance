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

```env
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

### Installation

Install the dependencies:

```bash
npm install
```

### Running the App

Start the API server (used for Gemini calls):

```bash
npm run server
```

Start the Vite development server:

```bash
npm run dev
```

The API server runs on `http://localhost:3001` and the app will typically start at `http://localhost:3000`.
