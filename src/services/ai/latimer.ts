import { AssessmentRequest, AssessmentResponse } from './types';
import { BaseAIService } from './base';
import { proxyRequest } from './proxy';

export class LatimerService extends BaseAIService {
  async assess(request: AssessmentRequest): Promise<AssessmentResponse> {
    if (!this.isInitialized()) {
      throw new Error('Latimer service not initialized');
    }

    return this.retryWithBackoff(async () => {
      try {
        console.log('Making Latimer API request...');
        
        const response = await proxyRequest('latimer', 'getCompletion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `You are an expert policy analyst. Analyze the alignment and impact between these documents:

Executive Order:
${request.executiveOrderText}

Policy Document:
${request.policyDocumentText}

Provide a concise analysis focusing on:
1. Alignment (how well they align)
2. Impact (potential effects)
3. Rating (explicitly state if positive, negative, or neutral)

Please format your response with clear sections and end with an explicit rating statement.`
          })
        });

        const data = await response.json();
        
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format');
        }

        // The Latimer API returns the response in the message.content field
        const assessmentText = data.message?.content || data.text || data.completion || data.response;
        if (!assessmentText || typeof assessmentText !== 'string') {
          console.error('Invalid Latimer response:', data);
          throw new Error('No assessment text in response');
        }

        return {
          text: assessmentText,
          rating: this.analyzeResponse(assessmentText),
          confidence: 0.8,
          metadata: {
            model: 'latimer',
            processingTime: data.processing_time,
            raw: data // Store raw response for debugging
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Latimer assessment error:', errorMessage);
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
}