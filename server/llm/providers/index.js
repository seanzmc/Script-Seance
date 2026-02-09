import { LocalOpenSourceProvider } from './local.js';
import { GeminiProvider } from './gemini.js';

export function createProvider(config) {
  switch (config.provider) {
    case 'local':
      return new LocalOpenSourceProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown LLM_PROVIDER: "${config.provider}"`);
  }
}

export { LocalOpenSourceProvider, GeminiProvider };
