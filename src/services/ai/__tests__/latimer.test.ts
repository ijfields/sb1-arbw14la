import { describe, it, expect, beforeEach } from 'vitest';
import { LatimerService } from '../latimer';
import type { AIConfig, AssessmentRequest } from '../types';
import './setup';

describe('LatimerService', () => {
  let service: LatimerService;
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

    service = new LatimerService();
  });

  it('should initialize correctly', async () => {
    await service.initialize(config);
    expect(service.isInitialized()).toBe(true);
  });

  it('should throw error if not initialized', async () => {
    await expect(service.assess(request)).rejects.toThrow('Latimer service not initialized');
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

  it('should detect positive rating from response', async () => {
    await service.initialize(config);
    const result = await service.assess(request);
    expect(result.rating).toBe('positive');
  });

  it('should include metadata in response', async () => {
    await service.initialize(config);
    const result = await service.assess(request);
    
    expect(result.metadata).toBeDefined();
    expect(result.metadata).toMatchObject({
      model: 'latimer',
      processingTime: expect.any(Number)
    });
  });
});