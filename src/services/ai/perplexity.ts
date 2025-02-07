import { AssessmentRequest, AssessmentResponse, PerplexityModel } from './types';
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
        
        // Determine chunk size based on model
        const model = request.model || 'sonar-pro';
        const maxChunkSize = this.getMaxChunkSize(model);
        const text = `${request.executiveOrderText}\n\n${request.policyDocumentText}`;
        const chunks = this.chunkText(text, maxChunkSize);
        
        let fullAnalysis = '';
        
        // Process each chunk
        for (const chunk of chunks) {
          const response = await proxyRequest('perplexity', '/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: `You are an expert policy analyst specializing in comparing executive orders with policy proposals.
Your task is to analyze the alignment and potential impact between them.

Focus on:
1. Direct Alignment: How well do the policy goals and approaches align or conflict?
2. Impact Analysis: How would this executive order affect the policy's implementation?
3. Specific Examples: Cite specific sections that demonstrate alignment or conflict
4. Clear Rating: Conclude with an explicit rating (positive/negative/neutral)

Format your response with clear sections and specific examples.`
                },
                {
                  role: "user",
                  content: `Analyze this text chunk for alignment and impact between the executive order and policy:

${chunk}

Focus on:
1. Direct alignment or conflicts between the executive order and policy
2. How this executive order would impact the policy's goals
3. Specific examples from both documents
4. Overall impact rating

End with an explicit rating statement: "Rating: [positive/negative/neutral]"`
                }
              ],
              temperature: request.temperature || 0.1,
              max_tokens: this.getMaxTokens(model),
              top_p: 0.9,
              stream: false
            })
          });

          const data = await response.json();
          
          if (!data?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from API');
          }

          fullAnalysis += data.choices[0].message.content + '\n\n';
        }

        // Final analysis to combine chunk results
        const finalResponse = await proxyRequest('perplexity', '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: `You are an expert policy analyst. Provide a final analysis of the alignment and impact between the executive order and policy document.

Focus on:
1. Direct Alignment: Identify clear alignments or conflicts
2. Impact Analysis: Assess how the executive order affects policy implementation
3. Evidence: Use specific examples from both documents
4. Clear Rating: Conclude with a definitive rating`
              },
              {
                role: "user",
                content: `Based on these analyses:

${fullAnalysis}

Provide a final comprehensive analysis focusing on:
1. Direct alignment or conflicts between the executive order and policy
2. Specific ways the executive order would impact policy implementation
3. Key examples from both documents demonstrating alignment or conflict
4. Overall assessment of compatibility

End with an explicit rating statement: "Rating: [positive/negative/neutral]"

Note: Focus on the relationship between the documents, not just summarizing them.`
              }
            ],
            temperature: 0.1,
            max_tokens: this.getMaxTokens(model)
          })
        });

        const finalData = await finalResponse.json();
        const content = finalData.choices[0].message.content;
        const rating = this.analyzeResponse(content);

        return {
          text: content,
          rating,
          confidence: this.calculateConfidence(content),
          metadata: {
            model,
            usage: finalData.usage,
            finish_reason: finalData.choices[0].finish_reason
          },
        };
      } catch (error) {
        console.error('Perplexity assessment error:', error);
        throw error;
      }
    });
  }

  private getMaxChunkSize(model: PerplexityModel): number {
    switch (model) {
      case 'sonar-pro':
        return 180000; // 200k context - margin for safety
      case 'sonar-reasoning-pro':
      case 'sonar-reasoning':
      case 'sonar':
        return 100000; // 127k context - margin for safety
      default:
        return 100000;
    }
  }

  private getMaxTokens(model: PerplexityModel): number {
    switch (model) {
      case 'sonar-pro':
      case 'sonar-reasoning-pro':
        return 8000;
      case 'sonar-reasoning':
      case 'sonar':
        return 4000;
      default:
        return 4000;
    }
  }

  private chunkText(text: string, maxSize: number): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if ((currentChunk + word).length > maxSize) {
        chunks.push(currentChunk.trim());
        currentChunk = word + ' ';
      } else {
        currentChunk += word + ' ';
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
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
    const positiveTerms = ['align', 'support', 'complement', 'reinforce', 'positive', 'compatible'];
    const negativeTerms = ['conflict', 'oppose', 'contradict', 'negative', 'misalign', 'incompatible'];
    
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

    // Increase confidence for specific examples
    if (text.includes('For example,') || text.includes('Specifically,')) confidence += 0.1;

    // Decrease confidence for uncertainty markers
    const uncertaintyTerms = ['maybe', 'perhaps', 'unclear', 'uncertain', 'possible', 'might'];
    uncertaintyTerms.forEach(term => {
      if (text.toLowerCase().includes(term)) confidence -= 0.05;
    });

    // Ensure confidence stays within valid range
    return Math.max(0.1, Math.min(1.0, confidence));
  }
}