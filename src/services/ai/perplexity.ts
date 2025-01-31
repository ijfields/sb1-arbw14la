import { AssessmentRequest, AssessmentResponse } from './types';
import { BaseAIService } from './base';
import { proxyRequest } from './proxy';

export class PerplexityService extends BaseAIService {
  async assess(request: AssessmentRequest): Promise<AssessmentResponse> {
    if (!this.isInitialized()) {
      throw new Error('Perplexity service not initialized');
    }

    return this.retryWithBackoff(async () => {
      try {
        console.log('Making Perplexity API request...');
        
        const response = await proxyRequest('perplexity', '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "system",
                content: "You are an expert policy analyst. Analyze the alignment and impact between executive orders and policy documents."
              },
              {
                role: "user",
                content: `Compare these documents:

Executive Order:
${request.executiveOrderText}

Policy Document:
${request.policyDocumentText}

Provide a concise analysis focusing on:
1. Alignment (how well they align)
2. Impact (potential effects)
3. Rating (explicitly state if positive, negative, or neutral)`
              }
            ],
            temperature: request.temperature || 0.1,
            max_tokens: request.maxTokens || 500,
            top_p: 0.9,
            stream: false
          })
        });

        const data = await response.json();
        
        if (!data?.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format from API');
        }

        const content = data.choices[0].message.content;
        const rating = this.analyzeResponse(content);

        return {
          text: content,
          rating,
          confidence: this.calculateConfidence(content),
          metadata: {
            model: 'sonar',
            usage: data.usage,
            finish_reason: data.choices[0].finish_reason
          },
        };
      } catch (error) {
        console.error('Perplexity assessment error:', error);
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
    const positiveTerms = ['align', 'support', 'complement', 'reinforce', 'positive'];
    const negativeTerms = ['conflict', 'oppose', 'contradict', 'negative', 'misalign'];
    
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