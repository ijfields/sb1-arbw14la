import { AIConfig } from './types';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// API keys and base URLs are server-side only. The client never talks to the
// providers directly — all requests go through the local /api/:provider proxy
// (see proxy.ts), and server.js injects the credentials there.
export function getProviderConfig(_provider: 'latimer' | 'perplexity' | 'deepseek'): AIConfig {
  return {
    maxRetries: DEFAULT_MAX_RETRIES,
    timeout: DEFAULT_TIMEOUT,
    features: {
      // Disable DeepSeek by default
      enableDeepseek: false
    }
  };
}

if (import.meta.env.DEV) {
  console.log('AI provider credentials are configured server-side; client requests go through the /api proxy.');
}
