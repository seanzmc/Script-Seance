# Security Notes

## AI API usage

- OpenAI API keys must never be exposed in client-side code or bundled assets.
- All AI requests must go through a server-side proxy that injects secrets at runtime.
- Client requests should be authenticated and subject to rate limits to protect usage and costs.
