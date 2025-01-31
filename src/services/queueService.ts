import { supabase } from '../lib/supabase';

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

const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 1000; // 1 second between API calls

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

  // Calculate priority based on signing date (more recent = higher priority)
  const priority = order?.signing_date 
    ? new Date(order.signing_date).getTime()
    : 0;

  // Queue assessment for both providers
  await Promise.all([
    createQueueItem(executiveOrderId, policyDocumentId, 'latimer', priority),
    createQueueItem(executiveOrderId, policyDocumentId, 'perplexity', priority)
  ]);
}

async function createQueueItem(
  executiveOrderId: string,
  policyDocumentId: string,
  provider: 'latimer' | 'perplexity',
  priority: number
) {
  const { error } = await supabase
    .from('assessment_queue')
    .insert({
      executive_order_id: executiveOrderId,
      policy_document_id: policyDocumentId,
      provider,
      priority,
      status: 'pending',
      attempts: 0
    });

  if (error) throw error;
}

export async function processQueue() {
  // Get next batch of pending items, ordered by priority (highest first)
  const { data: items, error } = await supabase
    .from('assessment_queue')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_RETRIES)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(5); // Process fewer items at a time

  if (error) throw error;
  if (!items?.length) return;

  for (const item of items) {
    await processQueueItem(item);
    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
  }
}

async function processQueueItem(item: QueueItem) {
  try {
    // Update status to processing
    await updateQueueItemStatus(item.id, 'processing');

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

  } catch (error) {
    console.error('Error processing queue item:', error);
    await updateQueueItemStatus(
      item.id,
      'failed',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function updateQueueItemStatus(
  id: string,
  status: QueueItem['status'],
  error?: string
) {
  const { error: updateError } = await supabase
    .from('assessment_queue')
    .update({
      status,
      error,
      attempts: supabase.sql`attempts + 1`,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updateError) throw updateError;
}

// Helper functions to be implemented
async function getExecutiveOrder(id: string) {
  const { data, error } = await supabase
    .from('executive_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

async function getPolicyDocument(id: string) {
  const { data, error } = await supabase
    .from('policy_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

async function performAIAssessment(
  order: any,
  document: any,
  provider: 'latimer' | 'perplexity'
) {
  // TODO: Implement AI provider integration
  return {
    text: 'Assessment placeholder',
    rating: 'neutral' as const,
    confidence: 0.5
  };
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
  const { error } = await supabase
    .from('ai_assessments')
    .insert({
      executive_order_id: executiveOrderId,
      policy_document_id: policyDocumentId,
      provider,
      assessment_text: assessment.text,
      rating: assessment.rating,
      confidence: assessment.confidence
    });

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
  const finalAssessment = calculateFinalAssessment(assessments);

  // Update or insert final assessment
  const { error: upsertError } = await supabase
    .from('impact_assessments')
    .upsert({
      executive_order_id: executiveOrderId,
      policy_document_id: policyDocumentId,
      final_rating: finalAssessment.rating,
      confidence: finalAssessment.confidence,
      last_updated: new Date().toISOString()
    });

  if (upsertError) throw upsertError;
}

function calculateFinalAssessment(assessments: any[]) {
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