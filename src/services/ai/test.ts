import { getAIService } from './factory';
import { getProviderConfig } from './config';
import type { AssessmentRequest } from './types';

const testData: AssessmentRequest = {
  executiveOrderText: 'This executive order aims to strengthen environmental protections by implementing stricter emissions standards.',
  policyDocumentText: 'The policy focuses on reducing carbon emissions through industry regulations and incentives for clean energy adoption.',
  maxTokens: 500,
  temperature: 0.1,
};

export async function testAIService(provider: 'latimer' | 'perplexity' | 'deepseek') {
  console.log(`Testing ${provider} service...`);
  
  try {
    const config = getProviderConfig(provider);
    console.log(`${provider} configuration loaded:`, {
      baseUrl: config.baseUrl,
      hasApiKey: !!config.apiKey,
      enabled: provider !== 'deepseek' || config.features?.enableDeepseek
    });

    // Skip DeepSeek if disabled
    if (provider === 'deepseek' && !config.features?.enableDeepseek) {
      return {
        success: false,
        message: 'DeepSeek integration is currently disabled'
      };
    }

    const service = await getAIService(provider, config);
    console.log(`${provider} service initialized`);

    console.log(`Sending test request to ${provider}...`);
    const result = await service.assess(testData);
    
    console.log(`${provider} assessment completed:`, {
      textPreview: result.text.substring(0, 100) + '...',
      rating: result.rating,
      confidence: result.confidence,
      metadata: result.metadata
    });

    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${provider} test failed:`, errorMessage);
    
    // Check for specific error types
    if (errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('Network error') ||
        errorMessage.includes('connection lost')) {
      throw new Error('Server connection lost. Please refresh the page.');
    }
    
    return { 
      success: false, 
      message: errorMessage
    };
  }
}