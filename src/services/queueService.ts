import { supabase } from '../lib/supabase';
import { adminPost } from './adminApi';
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
  federal_register_id: string | null;
}

interface PolicyDocumentRow {
  id: string;
  content: string;
}

// Truncation limits to keep prompts sane
const MAX_EO_CHARS = 4000;
const MAX_EO_FULLTEXT_CHARS = 12000;
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

  // Queue assessment for both providers in one server-side upsert. The admin
  // endpoint writes with the service-role key; the upsert resets any existing
  // pair back to pending instead of failing the
  // UNIQUE(executive_order_id, policy_document_id, provider) constraint.
  await adminPost('/queue/upsert', {
    items: ACTIVE_PROVIDERS.map(provider => ({
      executive_order_id: executiveOrderId,
      policy_document_id: policyDocumentId,
      provider,
      priority,
      status: 'pending',
      attempts: 0,
      error: null
    }))
  });
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

    // Mark queue item as completed. The server recomputes and upserts the
    // impact_assessments rollup as part of storeAssessment, so there is no
    // separate client-side rollup step.
    await updateQueueItemStatus(item.id, 'completed');

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
  // Status updates go through the server-side admin API (service-role key).
  await adminPost('/queue/status', {
    id,
    status,
    error: error ?? null,
    ...(attempts !== undefined ? { attempts } : {})
  });
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

// The Federal Register `abstract` (stored as `summary`) is almost always empty
// for executive orders, so a title-only prompt gives the model nothing to work
// with. When the order has a Federal Register document number, fetch its full
// text via the server proxy (the .txt endpoint has no CORS headers, so the
// browser can't reach it directly). Fall back to title + summary on any failure.
async function buildExecutiveOrderText(order: ExecutiveOrderRow): Promise<string> {
  if (order.federal_register_id) {
    try {
      const response = await fetch(`/api/eo-fulltext/${order.federal_register_id}`);
      if (response.ok) {
        const data = await response.json();
        const fullText = typeof data?.text === 'string' ? data.text.trim() : '';
        if (fullText) {
          console.log(
            `Using full text for EO ${order.federal_register_id} (${fullText.length} chars)`
          );
          return truncate(
            `Title: ${order.title ?? ''}\n\nFull text: ${fullText}`,
            MAX_EO_FULLTEXT_CHARS
          );
        }
      }
      console.warn(
        `Full text unavailable for EO ${order.federal_register_id} (status ${response.status}); falling back to summary`
      );
    } catch (error) {
      console.warn(
        `Failed to fetch full text for EO ${order.federal_register_id}; falling back to summary:`,
        error instanceof Error ? error.message : error
      );
    }
  } else {
    console.log('No federal_register_id on order; using title + summary');
  }

  // Fallback: title + summary
  return truncate(
    `Title: ${order.title ?? ''}\n\nSummary: ${order.summary ?? ''}`,
    MAX_EO_CHARS
  );
}

async function performAIAssessment(
  order: ExecutiveOrderRow,
  document: PolicyDocumentRow,
  provider: 'latimer' | 'perplexity'
): Promise<AssessmentResponse> {
  // Executive order text prefers full Federal Register text, falling back to
  // title + summary. Policy documents hold full extracted PDF text.
  const executiveOrderText = await buildExecutiveOrderText(order);
  const policyDocumentText = truncate(document.content ?? '', MAX_POLICY_CHARS);

  const service = await getAIService(provider, getProviderConfig(provider));
  return service.assess({
    executiveOrderText,
    policyDocumentText,
    // Full-text prompts need room for a complete analysis — the default
    // 500-token cap cut responses off before the final "Rating:" line.
    maxTokens: 1024
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
  // Persist through the server-side admin API (service-role key). The server
  // upserts ai_assessments (re-running a pair overwrites the previous result
  // via the UNIQUE(executive_order_id, policy_document_id, provider) index) and
  // recomputes + upserts the impact_assessments rollup so it cannot be spoofed
  // independently of the underlying AI assessments.
  await adminPost('/assessments', {
    executive_order_id: executiveOrderId,
    policy_document_id: policyDocumentId,
    provider,
    assessment_text: assessment.text,
    rating: assessment.rating,
    confidence: assessment.confidence
  });
}
