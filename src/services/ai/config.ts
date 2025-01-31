import { AIConfig } from './types';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

const ENV_PREFIX = 'VITE_';
const ENV_VARS = {
  LATIMER: {
    API_KEY: `${ENV_PREFIX}LATIMER_API_KEY`,
    BASE_URL: `${ENV_PREFIX}LATIMER_BASE_URL`,
  },
  PERPLEXITY: {
    API_KEY: `${ENV_PREFIX}PERPLEXITY_API_KEY`,
    BASE_URL: `${ENV_PREFIX}PERPLEXITY_BASE_URL`,
  },
  DEEPSEEK: {
    API_KEY: `${ENV_PREFIX}DEEPSEEK_API_KEY`,
    BASE_URL: `${ENV_PREFIX}DEEPSEEK_BASE_URL`,
  },
} as const;

function validateEnvVars(provider: 'LATIMER' | 'PERPLEXITY' | 'DEEPSEEK'): void {
  const missingVars = [];
  const vars = ENV_VARS[provider];

  for (const [key, envVar] of Object.entries(vars)) {
    if (!import.meta.env[envVar]) {
      missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables for ${provider}: ${missingVars.join(', ')}`
    );
  }
}

export function getProviderConfig(provider: 'latimer' | 'perplexity' | 'deepseek'): AIConfig {
  const upperProvider = provider.toUpperCase() as keyof typeof ENV_VARS;
  validateEnvVars(upperProvider);

  const vars = ENV_VARS[upperProvider];
  const baseUrl = import.meta.env[vars.BASE_URL] as string;
  const apiKey = import.meta.env[vars.API_KEY] as string;

  if (!apiKey || !baseUrl) {
    throw new Error(`Missing configuration for ${provider}`);
  }

  // Remove trailing slash from base URL if present
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  return {
    apiKey,
    baseUrl: normalizedBaseUrl,
    maxRetries: DEFAULT_MAX_RETRIES,
    timeout: DEFAULT_TIMEOUT,
    features: {
      // Disable DeepSeek by default
      enableDeepseek: false
    }
  };
}

if (import.meta.env.DEV) {
  console.log('Checking AI provider configurations...');
  try {
    const providers = ['latimer', 'perplexity', 'deepseek'] as const;
    for (const provider of providers) {
      try {
        const config = getProviderConfig(provider);
        console.log(`✓ ${provider} configuration valid:`, {
          baseUrl: config.baseUrl,
          hasApiKey: !!config.apiKey,
          enabled: provider !== 'deepseek' || config.features?.enableDeepseek
        });
      } catch (error) {
        console.warn(`⚠ ${provider} configuration incomplete:`, error);
      }
    }
  } catch (error) {
    console.error('Error checking configurations:', error);
  }
}