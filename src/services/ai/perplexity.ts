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
3. Rating (explicitly state if positive, negative, or neutral)

End your response with a final line formatted exactly as "Rating: positive", "Rating: negative", or "Rating: neutral".`
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
        const { rating, confidence } = this.analyzeAssessment(content);

        return {
          text: content,
          rating,
          confidence,
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
}