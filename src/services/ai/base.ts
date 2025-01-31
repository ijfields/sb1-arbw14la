import { AIConfig, AIService, AssessmentRequest, AssessmentResponse } from './types';

export abstract class BaseAIService implements AIService {
  protected config: AIConfig | null = null;
  protected retryDelays = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

  abstract assess(request: AssessmentRequest): Promise<AssessmentResponse>;

  async initialize(config: AIConfig): Promise<void> {
    this.validateConfig(config);
    this.config = config;
  }

  isInitialized(): boolean {
    return this.config !== null;
  }

  protected validateConfig(config: AIConfig): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    if (!config.baseUrl) {
      throw new Error('Base URL is required');
    }
    try {
      new URL(config.baseUrl);
    } catch {
      throw new Error('Invalid base URL format');
    }
    if (config.maxRetries < 0) {
      throw new Error('Max retries must be non-negative');
    }
    if (config.timeout < 0) {
      throw new Error('Timeout must be non-negative');
    }
  }

  protected async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Handle network errors specifically
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Network error: Unable to reach the API. Please check your internet connection.');
      }

      // Handle CORS errors
      if (error instanceof Error && error.message.includes('CORS')) {
        throw new Error('Network error: CORS policy prevented the request. Please check API configuration.');
      }

      if (
        !this.config ||
        retryCount >= this.config.maxRetries ||
        !this.shouldRetry(error)
      ) {
        if (error instanceof Error) {
          // Enhance error message for common issues
          if (error.message.includes('401')) {
            throw new Error('Authentication failed: Please check your API key.');
          }
          if (error.message.includes('403')) {
            throw new Error('Access denied: Please verify your API permissions.');
          }
          if (error.message.includes('429')) {
            throw new Error('Rate limit exceeded: Please try again in a few moments.');
          }
          if (error.message.includes('500')) {
            throw new Error('Server error: The API service is experiencing issues. Please try again later.');
          }
          throw error;
        }
        throw new Error('An unexpected error occurred');
      }

      const delay = this.retryDelays[retryCount] || this.retryDelays[this.retryDelays.length - 1];
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.retryWithBackoff(operation, retryCount + 1);
    }
  }

  protected shouldRetry(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('too many requests') ||
        message.includes('server error') ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('network') ||
        message.includes('failed to fetch')
      );
    }
    return false;
  }

  protected async makeRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config?.timeout || 30000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        headers: {
          ...options.headers,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Network error: Unable to reach the API. Please check your internet connection.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}