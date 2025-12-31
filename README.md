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

> **Note**: The application internally maps `GEMINI_API_KEY` to `process.env.API_KEY` via Vite configuration. Ensure you use the exact key name `GEMINI_API_KEY` in your `.env` file.

## Installation & Run Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)

### Installation

Install the dependencies:

```bash
npm install
```

### Running the App

Start the development server:

```bash
npm run dev
```

The application will typically start at `http://localhost:3000`.
