import { supabase } from '../lib/supabase';
import { getAIService } from './ai/factory';
import { getProviderConfig } from './ai/config';
import type { AssessmentResponse } from './ai/types';

interface QueueItem {
  id: string;
  executive_order_id: string;
  policy_document_id: string;
  provider: 'latimer' | 'perplexity';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  error?: string;
}

// Minimal row shapes used by the assessment pipeline
interface ExecutiveOrderRow {
  id: string;
  title: string;
  summary: string | null;
}

interface PolicyDocumentRow {
  id: string;
  content: string;
}

interface AIAssessmentRow {
  rating: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

// Truncation limits to keep prompts sane
const MAX_EO_CHARS = 4000;
const MAX_POLICY_CHARS = 12000;

const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 1000; // 1 second between API calls

// Only these providers are wired up (deepseek is disabled)
const ACTIVE_PROVIDERS: Array<'latimer' | 'perplexity'> = ['latimer', 'perplexity'];

export async function queueAssessment(
  executiveOrderId: string,
  policyDocumentId: string
) {
  // Get the signing date of the executive order
  const { data: order } = await supabase
    .from('executive_orders')
    .select('signing_date')
    .eq('id', executiveOrderId)
    .single();

  // Calculate priority based on signing date (more recent = higher priority).
  // The priority column is a Postgres integer (int4, max ~2.1e9), so we use
  // days-since-epoch rather than milliseconds to avoid overflow.
  const priority = order?.signing_date
    ? Math.floor(new Date(order.signing_date).getTime() / 86_400_000)
    : 0;

  // Queue assessment for both providers
  await Promise.all(
    ACTIVE_PROVIDERS.map(provider =>
      createQueueItem(executiveOrderId, policyDocumentId, provider, priority)
    )
  );
}

async function createQueueItem(
  executiveOrderId: string,
  policyDocumentId: string,
  provider: 'latimer' | 'perplexity',
  priority: number
) {
  // Upsert so re-running a pair resets it to pending instead of failing the
  // UNIQUE(executive_order_id, policy_document_id, provider) constraint.
  const { error } = await supabase
    .from('assessment_queue')
    .upsert(
      {
        executive_order_id: executiveOrderId,
        policy_document_id: policyDocumentId,
        provider,
        priority,
        status: 'pending',
        attempts: 0,
        error: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'executive_order_id,policy_document_id,provider' }
    );

  if (error) throw error;
}

export interface ProcessQueueSummary {
  processed: number;
  completed: number;
  failed: number;
}

export async function processQueue(): Promise<ProcessQueueSummary> {
  // Get next batch of pending items, ordered by priority (highest first)
  const { data: items, error } = await supabase
    .from('assessment_queue')
    .select('*')
    .in('status', ['pending', 'failed'])
    .in('provider', ACTIVE_PROVIDERS)
    .lt('attempts', MAX_RETRIES)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(5); // Process fewer items at a time

  if (error) throw error;

  const summary: ProcessQueueSummary = { processed: 0, completed: 0, failed: 0 };
  if (!items?.length) return summary;

  for (const item of items as QueueItem[]) {
    const ok = await processQueueItem(item);
    summary.processed += 1;
    if (ok) {
      summary.completed += 1;
    } else {
      summary.failed += 1;
    }
    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
  }

  return summary;
}

async function processQueueItem(item: QueueItem): Promise<boolean> {
  try {
    // Update status to processing (bump attempts once per processing attempt)
    await updateQueueItemStatus(item.id, 'processing', undefined, item.attempts + 1);

    // Get order and policy document content
    const [order, document] = await Promise.all([
      getExecutiveOrder(item.executive_order_id),
      getPolicyDocument(item.policy_document_id)
    ]);

    // Perform AI assessment
    const assessment = await performAIAssessment(
      order,
      document,
      item.provider
    );

    // Store assessment result
    await storeAssessment(
      item.executive_order_id,
      item.policy_document_id,
      item.provider,
      assessment
    );

    // Mark queue item as completed
    await updateQueueItemStatus(item.id, 'completed');

    // Update impact assessment
    await updateImpactAssessment(
      item.executive_order_id,
      item.policy_document_id
    );

    return true;
  } catch (error) {
    console.error('Error processing queue item:', error);
    await updateQueueItemStatus(item.id, 'failed', errorToMessage(error));
    return false;
  }
}

// Extract a human-readable message from thrown values. Supabase returns plain
// PostgrestError objects (not Error instances) carrying `message` and `code`
// (e.g. 42501 for RLS violations), so we preserve those for clear surfacing.
function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const e = error as { message?: string; code?: string };
    if (e.message) {
      return e.code ? `${e.message} (${e.code})` : e.message;
    }
  }
  return 'Unknown error';
}

async function updateQueueItemStatus(
  id: string,
  status: QueueItem['status'],
  error?: string,
  attempts?: number
) {
  const update: Record<string, unknown> = {
    status,
    error,
    updated_at: new Date().toISOString()
  };

  if (attempts !== undefined) {
    update.attempts = attempts;
  }

  const { error: updateError } = await supabase
    .from('assessment_queue')
    .update(update)
    .eq('id', id);

  if (updateError) throw updateError;
}

// Helper functions
async function getExecutiveOrder(id: string): Promise<ExecutiveOrderRow> {
  const { data, error } = await supabase
    .from('executive_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as ExecutiveOrderRow;
}

async function getPolicyDocument(id: string): Promise<PolicyDocumentRow> {
  const { data, error } = await supabase
    .from('policy_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as PolicyDocumentRow;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...[truncated]';
}

async function performAIAssessment(
  order: ExecutiveOrderRow,
  document: PolicyDocumentRow,
  provider: 'latimer' | 'perplexity'
): Promise<AssessmentResponse> {
  // Executive orders store only title + summary (full text isn't kept), so we
  // label them for the model. Policy documents hold full extracted PDF text.
  const executiveOrderText = truncate(
    `Title: ${order.title ?? ''}\n\nSummary: ${order.summary ?? ''}`,
    MAX_EO_CHARS
  );
  const policyDocumentText = truncate(document.content ?? '', MAX_POLICY_CHARS);

  const service = await getAIService(provider, getProviderConfig(provider));
  return service.assess({
    executiveOrderText,
    policyDocumentText
  });
}

async function storeAssessment(
  executiveOrderId: string,
  policyDocumentId: string,
  provider: 'latimer' | 'perplexity',
  assessment: {
    text: string;
    rating: 'positive' | 'neutral' | 'negative';
    confidence: number;
  }
) {
  // Upsert so re-running a pair overwrites the previous result instead of
  // violating the UNIQUE(executive_order_id, policy_document_id, provider) index.
  const { error } = await supabase
    .from('ai_assessments')
    .upsert(
      {
        executive_order_id: executiveOrderId,
        policy_document_id: policyDocumentId,
        provider,
        assessment_text: assessment.text,
        rating: assessment.rating,
        confidence: assessment.confidence
      },
      { onConflict: 'executive_order_id,policy_document_id,provider' }
    );

  if (error) throw error;
}

async function updateImpactAssessment(
  executiveOrderId: string,
  policyDocumentId: string
) {
  // Get all AI assessments for this combination
  const { data: assessments, error } = await supabase
    .from('ai_assessments')
    .select('*')
    .eq('executive_order_id', executiveOrderId)
    .eq('policy_document_id', policyDocumentId);

  if (error) throw error;
  if (!assessments?.length) return;

  // Calculate final rating based on weighted average
  const finalAssessment = calculateFinalAssessment(assessments as AIAssessmentRow[]);

  // Update or insert final assessment
  const { error: upsertError } = await supabase
    .from('impact_assessments')
    .upsert(
      {
        executive_order_id: executiveOrderId,
        policy_document_id: policyDocumentId,
        final_rating: finalAssessment.rating,
        confidence: finalAssessment.confidence,
        last_updated: new Date().toISOString()
      },
      { onConflict: 'executive_order_id,policy_document_id' }
    );

  if (upsertError) throw upsertError;
}

function calculateFinalAssessment(assessments: AIAssessmentRow[]) {
  // Simple averaging for now - can be made more sophisticated
  const ratingScores = {
    positive: 1,
    neutral: 0,
    negative: -1
  };

  const weightedSum = assessments.reduce((sum, assessment) => {
    return sum + ratingScores[assessment.rating] * assessment.confidence;
  }, 0);

  const avgConfidence = assessments.reduce((sum, assessment) => {
    return sum + assessment.confidence;
  }, 0) / assessments.length;

  const avgScore = weightedSum / assessments.length;

  let finalRating: 'positive' | 'neutral' | 'negative';
  if (avgScore > 0.3) finalRating = 'positive';
  else if (avgScore < -0.3) finalRating = 'negative';
  else finalRating = 'neutral';

  return {
    rating: finalRating,
    confidence: avgConfidence
  };
}
