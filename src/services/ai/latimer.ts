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

Please format your response with clear sections. End your response with a final line formatted exactly as "Rating: positive", "Rating: negative", or "Rating: neutral".`
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

        const { rating, confidence } = this.analyzeAssessment(assessmentText, 0.8);

        return {
          text: assessmentText,
          rating,
          confidence,
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
}