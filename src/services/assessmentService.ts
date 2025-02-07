import { supabase } from '../lib/supabase';
import { logTokenUsage } from './tokenMonitor';
import { getAIService } from './ai/factory';
import { getProviderConfig } from './ai/config';
import { getPolicyDocumentPDF } from './documentService';

export type PolicyType = 
  | 'project2025' 
  | 'agenda47' 
  | 'attack_on_power' 
  | 'peoples_response'
  | 'contract_black_america'
  | 'harris_economic_plan';

interface AssessmentResult {
  text: string;
  rating: 'positive' | 'neutral' | 'negative';
  confidence: number;
  tokenUsage: number;
}

interface AssessmentProgress {
  onProgress?: (progress: number) => void;
  onStatus?: (status: string) => void;
}

const ASSESSMENT_TIMEOUT = 120000; // 120 seconds for chunked processing
const RETRY_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You are an expert policy analyst specializing in comparing executive orders with policy proposals. 
Your task is to analyze the alignment and potential impact between an executive order and a policy document.

Focus on:
1. Direct Alignment: How well do the policy goals and approaches align or conflict?
2. Impact Analysis: How would this executive order affect the policy's implementation?
3. Specific Examples: Cite specific sections that demonstrate alignment or conflict
4. Clear Rating: Conclude with an explicit rating (positive/negative/neutral)

Format your response with clear sections and specific examples.`;

const USER_PROMPT = (orderText: string, policyText: string) => `Compare these documents:

EXECUTIVE ORDER:
${orderText}

POLICY DOCUMENT:
${policyText}

Analyze their relationship focusing on:
1. Direct alignment or conflicts between the executive order and policy
2. How this executive order would impact the policy's goals
3. Specific examples from both documents
4. Overall impact rating

End with an explicit rating statement: "Rating: [positive/negative/neutral]"`;

export async function assessExecutiveOrder(
  orderId: string,
  policyType: PolicyType,
  isDevelopment: boolean = false,
  progress?: AssessmentProgress
): Promise<AssessmentResult> {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Assessment timed out. Please try again.'));
      }, ASSESSMENT_TIMEOUT);
    });

    const assessmentPromise = performAssessment(orderId, policyType, isDevelopment, progress);
    const result = await Promise.race([assessmentPromise, timeoutPromise]) as AssessmentResult;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return result;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (error instanceof Error) {
      if (error.message.includes('timed out')) {
        throw new Error('The assessment is taking longer than expected. Please try again.');
      }
      throw error;
    }
    throw new Error('Assessment failed unexpectedly');
  }
}

async function performAssessment(
  orderId: string,
  policyType: PolicyType,
  isDevelopment: boolean,
  progress?: AssessmentProgress
): Promise<AssessmentResult> {
  if (!orderId) throw new Error('Order ID is required');
  if (!policyType) throw new Error('Policy type is required');

  console.log('Starting assessment:', { orderId, policyType, isDevelopment });

  try {
    // Update progress
    if (progress?.onStatus) {
      progress.onStatus('Fetching documents...');
    }
    if (progress?.onProgress) {
      progress.onProgress(10);
    }

    // Get executive order content
    const { data: order, error: orderError } = await supabase
      .from('executive_orders')
      .select('title, summary')
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.error('Error fetching order:', orderError);
      throw new Error('Failed to fetch executive order');
    }

    if (!order) {
      throw new Error('Executive order not found');
    }

    // Get policy document
    const { data: policies, error: policyError } = await supabase
      .from('policy_documents')
      .select('id, title, content')
      .eq('document_type', policyType)
      .order('created_at', { ascending: false })
      .limit(1);

    if (policyError) {
      console.error('Error fetching policy:', policyError);
      throw new Error('Failed to fetch policy document');
    }

    const policy = policies?.[0];
    if (!policy) {
      throw new Error(`No policy document found for type: ${policyType}`);
    }

    // Update progress
    if (progress?.onStatus) {
      progress.onStatus('Preparing assessment...');
    }
    if (progress?.onProgress) {
      progress.onProgress(30);
    }

    // Initialize Perplexity service
    const perplexityConfig = getProviderConfig('perplexity');
    const perplexityService = await getAIService('perplexity', perplexityConfig);

    // Update progress
    if (progress?.onStatus) {
      progress.onStatus('Processing assessment...');
    }
    if (progress?.onProgress) {
      progress.onProgress(50);
    }

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < RETRY_ATTEMPTS) {
      try {
        const assessment = await perplexityService.assess({
          executiveOrderText: `Title: ${order.title}\n\nSummary: ${order.summary}`,
          policyDocumentText: policy.content,
          maxTokens: isDevelopment ? 4000 : 8000,
          temperature: 0.3,
          model: isDevelopment ? 'sonar' : 'sonar-pro'
        });

        // Log token usage
        if (assessment.metadata?.usage?.total_tokens) {
          await logTokenUsage('perplexity', assessment.metadata.usage.total_tokens);
        }

        // Update progress
        if (progress?.onStatus) {
          progress.onStatus('Assessment complete');
        }
        if (progress?.onProgress) {
          progress.onProgress(100);
        }

        return {
          text: assessment.text,
          rating: assessment.rating,
          confidence: assessment.confidence,
          tokenUsage: assessment.metadata?.usage?.total_tokens || 0
        };
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error : new Error('Assessment failed');
        
        if (attempts < RETRY_ATTEMPTS) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          
          if (progress?.onStatus) {
            progress.onStatus(`Retrying assessment (attempt ${attempts + 1})...`);
          }
        }
      }
    }

    throw lastError || new Error('Assessment failed after retries');
  } catch (error) {
    console.error('AI assessment error:', error);
    throw error instanceof Error ? error : new Error('AI assessment failed');
  }
}