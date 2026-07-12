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

  // Patterns indicating the model could not actually perform the comparison
  // (e.g. because the executive order had no summary/content). When these fire
  // we force a neutral rating with a low-confidence floor rather than letting
  // the keyword fallback misfire on words like "align" in the boilerplate.
  private static readonly INSUFFICIENT_CONTENT_RE =
    /cannot be (analyzed|assessed|determined)|no (summary|content|text) (is )?(available|provided)|missing data|unable to (analyze|assess|compare)|insufficient (information|data|content)/i;

  // Matches an explicit rating statement in many shapes:
  // "Rating: Positive", "**Rating: negative**", "the rating is neutral",
  // "rating = positive", "rating - neutral".
  private static readonly RATING_RE =
    /rating\s*(?:is|:|=|-|—)?\s*\**\s*(positive|negative|neutral)/gi;

  /**
   * Extract a rating and confidence from an assessment response.
   *
   * 1. If the response signals it couldn't analyze the content, return neutral
   *    with a low confidence floor.
   * 2. Otherwise use the LAST explicit "Rating: ..." statement if present.
   * 3. Only if no explicit rating exists, fall back to keyword scoring.
   */
  protected analyzeAssessment(
    text: string,
    baseConfidence = 0.7
  ): { rating: AssessmentResponse['rating']; confidence: number } {
    // 1. Insufficient-content check first
    if (BaseAIService.INSUFFICIENT_CONTENT_RE.test(text)) {
      return { rating: 'neutral', confidence: 0.2 };
    }

    const rating = this.analyzeResponse(text);
    const confidence = this.calculateConfidence(text, baseConfidence);
    return { rating, confidence };
  }

  protected analyzeResponse(text: string): AssessmentResponse['rating'] {
    // Insufficient-content check takes precedence over any keyword scoring.
    if (BaseAIService.INSUFFICIENT_CONTENT_RE.test(text)) {
      return 'neutral';
    }

    // Find ALL explicit rating statements and use the LAST one. Models often
    // restate the rating at the end, which is the authoritative one.
    const matches = [...text.matchAll(BaseAIService.RATING_RE)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1][1].toLowerCase();
      return last as AssessmentResponse['rating'];
    }

    // Fall back to keyword scoring (merged term lists from all providers).
    const normalized = text.toLowerCase();
    const positiveTerms = [
      'align', 'support', 'complement', 'reinforce', 'enhance', 'positive'
    ];
    const negativeTerms = [
      'conflict', 'oppose', 'contradict', 'undermine', 'hinder', 'negative', 'misalign'
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    positiveTerms.forEach(term => {
      const found = normalized.match(new RegExp(term, 'g'));
      if (found) positiveScore += found.length;
    });

    negativeTerms.forEach(term => {
      const found = normalized.match(new RegExp(term, 'g'));
      if (found) negativeScore += found.length;
    });

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  protected calculateConfidence(text: string, baseConfidence = 0.7): number {
    // Low-confidence floor when the model couldn't analyze the content.
    if (BaseAIService.INSUFFICIENT_CONTENT_RE.test(text)) {
      return 0.2;
    }

    let confidence = baseConfidence;

    // Increase confidence based on analysis completeness
    if (text.includes('Alignment:')) confidence += 0.1;
    if (text.includes('Impact:')) confidence += 0.1;
    if (text.includes('Rating:')) confidence += 0.1;

    // Decrease confidence for uncertainty markers
    const uncertaintyTerms = ['maybe', 'perhaps', 'unclear', 'uncertain', 'possible'];
    uncertaintyTerms.forEach(term => {
      if (text.toLowerCase().includes(term)) confidence -= 0.05;
    });

    // Ensure confidence stays within valid range
    return Math.max(0.1, Math.min(1.0, confidence));
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