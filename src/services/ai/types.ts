export type AIProvider = 'latimer' | 'perplexity' | 'deepseek';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries: number;
  timeout: number;
  features?: {
    enableDeepseek?: boolean;
  };
}

export interface AssessmentRequest {
  executiveOrderText: string;
  policyDocumentText: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AssessmentResponse {
  text: string;
  rating: 'positive' | 'neutral' | 'negative';
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface AIService {
  initialize(config: AIConfig): Promise<void>;
  assess(request: AssessmentRequest): Promise<AssessmentResponse>;
  isInitialized(): boolean;
}