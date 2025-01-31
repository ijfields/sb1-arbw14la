import { describe, it, expect, beforeEach } from 'vitest';
import { PerplexityService } from '../perplexity';
import type { AIConfig, AssessmentRequest } from '../types';
import './setup';

describe('PerplexityService', () => {
  let service: PerplexityService;
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

    service = new PerplexityService();
  });

  it('should initialize correctly', async () => {
    await service.initialize(config);
    expect(service.isInitialized()).toBe(true);
  });

  it('should throw error if not initialized', async () => {
    await expect(service.assess(request)).rejects.toThrow('Perplexity service not initialized');
  });

  it('should assess documents successfully', async () => {
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

  it('should detect neutral rating from response', async () => {
    await service.initialize(config);
    const result = await service.assess(request);
    expect(result.rating).toBe('neutral');
  });

  it('should include metadata in response', async () => {
    await service.initialize(config);
    const result = await service.assess(request);
    
    expect(result.metadata).toBeDefined();
    expect(result.metadata).toMatchObject({
      model: 'sonar',
      usage: expect.any(Object),
      finish_reason: expect.any(String)
    });
  });
});