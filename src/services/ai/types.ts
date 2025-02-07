export type AIProvider = 'latimer' | 'perplexity' | 'deepseek';

export type PerplexityModel = 'sonar-reasoning-pro' | 'sonar-reasoning' | 'sonar-pro' | 'sonar';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries: number;
  timeout: number;
  features?: {
    enableDeepseek?: boolean;
  };
  model?: PerplexityModel;
}

export interface AssessmentRequest {
  executiveOrderText: string;
  policyDocumentText: string;
  maxTokens?: number;
  temperature?: number;
  model?: PerplexityModel;
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
  assessWithFile?(formData: FormData): Promise<AssessmentResponse>;
  isInitialized(): boolean;
}