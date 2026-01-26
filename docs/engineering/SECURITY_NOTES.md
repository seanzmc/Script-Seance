# Security Notes

## Gemini API usage

- Gemini API keys must never be exposed in client-side code or bundled assets.
- All Gemini/AI requests must go through a server-side proxy that injects the secret at runtime.
- Client requests should be authenticated and subject to rate limits to protect usage and costs.
