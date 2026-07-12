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

Please format your response with clear sections. End your response with a final line formatted exactly as "Rating: positive", "Rating: negative", or "Rating: neutral".`
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
        const { rating, confidence } = this.analyzeAssessment(assessmentText);

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
}