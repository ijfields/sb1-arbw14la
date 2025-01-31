import { AssessmentRequest, AssessmentResponse } from './types';
import { BaseAIService } from './base';
import { proxyRequest } from './proxy';

export class DeepSeekService extends BaseAIService {
  async assess(request: AssessmentRequest): Promise<AssessmentResponse> {
    if (!this.isInitialized()) {
      throw new Error('DeepSeek service not initialized');
    }

    return this.retryWithBackoff(async () => {
      try {
        console.log('Making DeepSeek API request...');
        
        const response = await proxyRequest('deepseek', 'v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            api_key: this.config?.apiKey,
            model: "deepseek-chat",
            messages: [{
              role: "system",
              content: "You are an expert policy analyst. Analyze the alignment and impact between executive orders and policy documents."
            }, {
              role: "user",
              content: `Compare these documents:

Executive Order:
${request.executiveOrderText}

Policy Document:
${request.policyDocumentText}

Provide a concise analysis focusing on:
1. Alignment (how well they align)
2. Impact (potential effects)
3. Rating (explicitly state if positive, negative, or neutral)

Please format your response with clear sections and end with an explicit rating statement.`
            }],
            temperature: request.temperature || 0.3,
            max_tokens: request.maxTokens || 1000,
            stream: false
          })
        });

        const data = await response.json();
        
        if (!data?.choices?.[0]?.message?.content) {
          console.error('Invalid DeepSeek response:', data);
          throw new Error('Invalid response format from DeepSeek API');
        }

        const assessmentText = data.choices[0].message.content;
        const rating = this.analyzeResponse(assessmentText);
        const confidence = this.calculateConfidence(assessmentText);

        return {
          text: assessmentText,
          rating,
          confidence,
          metadata: {
            model: 'deepseek-chat',
            usage: data.usage,
            finish_reason: data.choices[0].finish_reason
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('DeepSeek assessment error:', errorMessage);
        
        // Check for authentication error
        if (errorMessage.includes('Authentication Fails')) {
          throw new Error('Authentication failed: Invalid API key');
        }
        
        throw error;
      }
    });
  }

  private analyzeResponse(text: string): AssessmentResponse['rating'] {
    const normalized = text.toLowerCase();
    
    // First check for explicit rating
    if (normalized.includes('rating: positive') || 
        normalized.includes('rating:positive')) {
      return 'positive';
    }
    if (normalized.includes('rating: negative') || 
        normalized.includes('rating:negative')) {
      return 'negative';
    }
    if (normalized.includes('rating: neutral') || 
        normalized.includes('rating:neutral')) {
      return 'neutral';
    }

    // Fall back to sentiment analysis
    const positiveTerms = ['align', 'support', 'complement', 'reinforce', 'enhance'];
    const negativeTerms = ['conflict', 'oppose', 'contradict', 'undermine', 'hinder'];
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    positiveTerms.forEach(term => {
      const matches = normalized.match(new RegExp(term, 'g'));
      if (matches) positiveScore += matches.length;
    });
    
    negativeTerms.forEach(term => {
      const matches = normalized.match(new RegExp(term, 'g'));
      if (matches) negativeScore += matches.length;
    });
    
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  private calculateConfidence(text: string): number {
    let confidence = 0.7; // Base confidence

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
}