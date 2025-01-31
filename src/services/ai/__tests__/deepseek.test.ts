import { describe, it, expect, beforeEach } from 'vitest';
import { DeepSeekService } from '../deepseek';
import type { AIConfig, AssessmentRequest } from '../types';
import './setup';

describe('DeepSeekService', () => {
  let service: DeepSeekService;
  let config: AIConfig;
  let request: AssessmentRequest;

  beforeEach(() => {
    config = {
      apiKey: 'test-key',
      baseUrl: 'http://localhost:3000',
      maxRetries: 3,
      timeout: 5000
    };

    request = {
      executiveOrderText: 'Test executive order text',
      policyDocumentText: 'Test policy document text',
      maxTokens: 500,
      temperature: 0.3
    };

    service = new DeepSeekService();
  });

  it('should initialize correctly', async () => {
    await service.initialize(config);
    expect(service.isInitialized()).toBe(true);
  });

  it('should throw error if not initialized', async () => {
    await expect(service.assess(request)).rejects.toThrow('DeepSeek service not initialized');
  });

  it('should fail without API key', async () => {
    config.apiKey = '';
    await service.initialize(config);
    await expect(service.assess(request)).rejects.toThrow('Authentication failed: Invalid API key');
  });

  it('should assess documents successfully with valid API key', async () => {
    await service.initialize(config);
    const result = await service.assess(request);

    expect(result).toMatchObject({
      text: expect.any(String),
      rating: expect.stringMatching(/^(positive|negative|neutral)$/),
      confidence: expect.any(Number)
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should detect negative rating from response', async () => {
    await service.initialize(config);
    const result = await service.assess(request);
    expect(result.rating).toBe('negative');
  });

  it('should include metadata in response', async () => {
    await service.initialize(config);
    const result = await service.assess(request);
    
    expect(result.metadata).toBeDefined();
    expect(result.metadata).toMatchObject({
      model: 'deepseek-chat',
      usage: expect.any(Object),
      finish_reason: expect.any(String)
    });
  });
});