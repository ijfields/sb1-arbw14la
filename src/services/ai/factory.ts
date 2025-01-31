import { AIProvider, AIService, AIConfig } from './types';
import { LatimerService } from './latimer';
import { PerplexityService } from './perplexity';
import { DeepSeekService } from './deepseek';

const services = new Map<AIProvider, AIService>();

export async function getAIService(provider: AIProvider, config: AIConfig): Promise<AIService> {
  // Check if DeepSeek is disabled
  if (provider === 'deepseek' && !config.features?.enableDeepseek) {
    throw new Error('DeepSeek integration is currently disabled');
  }

  let service = services.get(provider);

  if (!service) {
    service = createService(provider);
    services.set(provider, service);
  }

  if (!service.isInitialized()) {
    await service.initialize(config);
  }

  return service;
}

function createService(provider: AIProvider): AIService {
  switch (provider) {
    case 'latimer':
      return new LatimerService();
    case 'perplexity':
      return new PerplexityService();
    case 'deepseek':
      return new DeepSeekService();
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}