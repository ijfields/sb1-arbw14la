// Admin write API — server-side writes behind the Supabase service-role key.
//
// The Supabase anon key is public (shipped in every client bundle), so it must
// never carry write privileges. All database writes are funneled through these
// narrow, validated endpoints, which use the service-role key (bypasses RLS).
// See issue #3. The anon INSERT/UPDATE policies are dropped in migration
// 20260714000000_revoke_anon_writes.sql.
//
// Endpoints (mounted at /api/admin in server.js):
//   POST /orders/batch   — bulk insert + per-row update of executive_orders
//   POST /documents      — insert one policy_documents row
//   POST /queue/upsert   — upsert assessment_queue rows
//   POST /queue/status   — update one assessment_queue row's status
//   POST /assessments    — upsert one ai_assessments row + recompute rollup

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Service-role Supabase client (lazy). Missing key => endpoints return 503.
// ---------------------------------------------------------------------------
let serviceClient;
let serviceClientChecked = false;

function getServiceClient() {
  if (!serviceClientChecked) {
    serviceClientChecked = true;
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      serviceClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
  }
  return serviceClient;
}

// Wrap a handler so a missing service key yields a clear 503 and thrown errors
// yield a clean 500 instead of crashing the process.
function withService(handler) {
  return async (req, res) => {
    const client = getServiceClient();
    if (!client) {
      return res.status(503).json({
        message:
          'SUPABASE_SERVICE_ROLE_KEY not configured on the server. ' +
          'Database writes are disabled until it is set.'
      });
    }
    try {
      await handler(req, res, client);
    } catch (error) {
      console.error('Admin API error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          message: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Auth hook: if ADMIN_API_TOKEN is set, require a matching x-admin-token header.
// When unset (local dev) no check is performed.
// ---------------------------------------------------------------------------
router.use((req, res, next) => {
  const expected = process.env.ADMIN_API_TOKEN;
  if (expected) {
    const provided = req.get('x-admin-token');
    if (provided !== expected) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const ORDER_FIELDS = [
  'number',
  'title',
  'federal_register_id',
  'federal_register_url',
  'signing_date',
  'publication_date',
  'pdf_url',
  'summary',
  'category',
  'status',
  'whitehouse_title',
  'whitehouse_date',
  'whitehouse_url'
];

// Keep only allowlisted keys; drop everything else so callers can't set
// arbitrary columns (e.g. id, created_at) through the write path.
function pickOrderFields(row) {
  const out = {};
  if (!row || typeof row !== 'object') return out;
  for (const key of ORDER_FIELDS) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// POST /orders/batch — { inserts: [...], updates: [{ id, data }, ...] }
// ---------------------------------------------------------------------------
router.post('/orders/batch', withService(async (req, res, client) => {
  const body = req.body || {};
  const inserts = Array.isArray(body.inserts) ? body.inserts : [];
  const updates = Array.isArray(body.updates) ? body.updates : [];

  if (!Array.isArray(body.inserts) && body.inserts !== undefined) {
    return res.status(400).json({ message: 'inserts must be an array' });
  }
  if (!Array.isArray(body.updates) && body.updates !== undefined) {
    return res.status(400).json({ message: 'updates must be an array' });
  }
  if (inserts.length + updates.length > 200) {
    return res.status(400).json({ message: 'Too many items (max 200 per call)' });
  }

  const cleanInserts = inserts.map(pickOrderFields);
  let inserted = 0;
  let updated = 0;
  const errors = [];

  // Bulk insert with per-row fallback so one bad record doesn't sink the page.
  if (cleanInserts.length > 0) {
    const { error: bulkError } = await client
      .from('executive_orders')
      .insert(cleanInserts);

    if (bulkError) {
      console.error('Bulk insert failed, retrying row by row:', bulkError.message);
      for (const row of cleanInserts) {
        const { error: rowError } = await client
          .from('executive_orders')
          .insert(row);
        if (rowError) {
          errors.push({ number: row.number, error: rowError.message });
        } else {
          inserted++;
        }
      }
    } else {
      inserted += cleanInserts.length;
    }
  }

  // Per-row updates.
  for (const update of updates) {
    if (!update || typeof update !== 'object' || !isNonEmptyString(update.id)) {
      errors.push({ error: 'Update missing valid id' });
      continue;
    }
    const data = pickOrderFields(update.data);
    const { error: updateError } = await client
      .from('executive_orders')
      .update(data)
      .eq('id', update.id);
    if (updateError) {
      errors.push({ id: update.id, error: updateError.message });
    } else {
      updated++;
    }
  }

  return res.json({ inserted, updated, errors });
}));

// ---------------------------------------------------------------------------
// POST /documents — { title, document_type, content, pdf_data }
// ---------------------------------------------------------------------------
const MAX_PDF_BASE64 = 15 * 1024 * 1024; // 15MB

router.post('/documents', withService(async (req, res, client) => {
  const { title, document_type, content, pdf_data } = req.body || {};

  if (!isNonEmptyString(title) || title.length > 500) {
    return res.status(400).json({ message: 'title is required (max 500 chars)' });
  }
  if (!isNonEmptyString(document_type) || document_type.length > 200) {
    return res.status(400).json({ message: 'document_type is required (max 200 chars)' });
  }
  if (!isNonEmptyString(content)) {
    return res.status(400).json({ message: 'content is required' });
  }
  if (typeof pdf_data !== 'string' || pdf_data.length === 0) {
    return res.status(400).json({ message: 'pdf_data is required' });
  }
  if (pdf_data.length > MAX_PDF_BASE64) {
    return res.status(400).json({ message: 'pdf_data exceeds maximum size (15MB)' });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdf_data)) {
    return res.status(400).json({ message: 'pdf_data must be base64' });
  }

  const { data, error } = await client
    .from('policy_documents')
    .insert({ title, document_type, content, pdf_data })
    .select('id')
    .single();

  if (error) return res.status(500).json({ message: error.message });

  return res.json({ id: data.id });
}));

// ---------------------------------------------------------------------------
// POST /queue/upsert — { items: [...] } for assessment_queue
// ---------------------------------------------------------------------------
const QUEUE_PROVIDERS = ['latimer', 'perplexity'];
const QUEUE_STATUSES = ['pending', 'processing', 'completed', 'failed'];

router.post('/queue/upsert', withService(async (req, res, client) => {
  const items = req.body && Array.isArray(req.body.items) ? req.body.items : null;
  if (!items) {
    return res.status(400).json({ message: 'items must be an array' });
  }
  if (items.length === 0 || items.length > 200) {
    return res.status(400).json({ message: 'items must contain 1..200 rows' });
  }

  const rows = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ message: 'Each item must be an object' });
    }
    if (!isNonEmptyString(item.executive_order_id) || !isNonEmptyString(item.policy_document_id)) {
      return res.status(400).json({ message: 'executive_order_id and policy_document_id are required' });
    }
    if (!QUEUE_PROVIDERS.includes(item.provider)) {
      return res.status(400).json({ message: 'Invalid provider' });
    }
    const status = item.status ?? 'pending';
    if (!QUEUE_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    rows.push({
      executive_order_id: item.executive_order_id,
      policy_document_id: item.policy_document_id,
      provider: item.provider,
      priority: Number.isFinite(item.priority) ? item.priority : 0,
      status,
      attempts: Number.isFinite(item.attempts) ? item.attempts : 0,
      error: item.error ?? null,
      updated_at: new Date().toISOString()
    });
  }

  const { error } = await client
    .from('assessment_queue')
    .upsert(rows, { onConflict: 'executive_order_id,policy_document_id,provider' });

  if (error) return res.status(500).json({ message: error.message });

  return res.json({ upserted: rows.length });
}));

// ---------------------------------------------------------------------------
// POST /queue/status — { id, status, error?, attempts? }
// ---------------------------------------------------------------------------
router.post('/queue/status', withService(async (req, res, client) => {
  const { id, status, error, attempts } = req.body || {};

  if (!isNonEmptyString(id)) {
    return res.status(400).json({ message: 'id is required' });
  }
  if (!QUEUE_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const update = {
    status,
    error: error ?? null,
    updated_at: new Date().toISOString()
  };
  if (attempts !== undefined) {
    if (!Number.isFinite(attempts)) {
      return res.status(400).json({ message: 'attempts must be a number' });
    }
    update.attempts = attempts;
  }

  const { error: updateError } = await client
    .from('assessment_queue')
    .update(update)
    .eq('id', id);

  if (updateError) return res.status(500).json({ message: updateError.message });

  return res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// POST /assessments — upsert ai_assessments + recompute impact_assessments
// ---------------------------------------------------------------------------
const RATINGS = ['positive', 'neutral', 'negative'];
const ASSESSMENT_PROVIDERS = ['latimer', 'perplexity'];

// Port of calculateFinalAssessment from queueService: rating scores weighted by
// confidence, averaged; thresholds ±0.3; confidence is the mean confidence.
function calculateFinalAssessment(assessments) {
  const ratingScores = { positive: 1, neutral: 0, negative: -1 };
  const weightedSum = assessments.reduce(
    (sum, a) => sum + ratingScores[a.rating] * a.confidence,
    0
  );
  const avgConfidence =
    assessments.reduce((sum, a) => sum + a.confidence, 0) / assessments.length;
  const avgScore = weightedSum / assessments.length;

  let rating;
  if (avgScore > 0.3) rating = 'positive';
  else if (avgScore < -0.3) rating = 'negative';
  else rating = 'neutral';

  return { rating, confidence: avgConfidence };
}

router.post('/assessments', withService(async (req, res, client) => {
  const {
    executive_order_id,
    policy_document_id,
    provider,
    assessment_text,
    rating,
    confidence
  } = req.body || {};

  if (!isNonEmptyString(executive_order_id) || !isNonEmptyString(policy_document_id)) {
    return res.status(400).json({ message: 'executive_order_id and policy_document_id are required' });
  }
  if (!ASSESSMENT_PROVIDERS.includes(provider)) {
    return res.status(400).json({ message: 'Invalid provider' });
  }
  if (!isNonEmptyString(assessment_text)) {
    return res.status(400).json({ message: 'assessment_text is required' });
  }
  if (!RATINGS.includes(rating)) {
    return res.status(400).json({ message: 'Invalid rating' });
  }
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return res.status(400).json({ message: 'confidence must be a number between 0 and 1' });
  }

  // Upsert the individual AI assessment.
  const { error: aiError } = await client
    .from('ai_assessments')
    .upsert(
      {
        executive_order_id,
        policy_document_id,
        provider,
        assessment_text,
        rating,
        confidence
      },
      { onConflict: 'executive_order_id,policy_document_id,provider' }
    );

  if (aiError) return res.status(500).json({ message: aiError.message });

  // Recompute the rollup from all AI assessments for this pair, server-side, so
  // the impact_assessments rating can't be spoofed independently.
  const { data: assessments, error: readError } = await client
    .from('ai_assessments')
    .select('rating, confidence')
    .eq('executive_order_id', executive_order_id)
    .eq('policy_document_id', policy_document_id);

  if (readError) return res.status(500).json({ message: readError.message });

  if (assessments && assessments.length > 0) {
    const final = calculateFinalAssessment(assessments);
    const { error: rollupError } = await client
      .from('impact_assessments')
      .upsert(
        {
          executive_order_id,
          policy_document_id,
          final_rating: final.rating,
          confidence: final.confidence,
          last_updated: new Date().toISOString()
        },
        { onConflict: 'executive_order_id,policy_document_id' }
      );

    if (rollupError) return res.status(500).json({ message: rollupError.message });
  }

  return res.json({ ok: true });
}));

export default router;
