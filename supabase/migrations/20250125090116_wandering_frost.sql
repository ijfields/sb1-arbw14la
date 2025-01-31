/*
  # Assessment Test Data

  1. Changes
    - Add test assessments for pending and Federal Register orders
    - Add test impact assessments
    - Add test queue items
  
  2. Test Data
    - Creates assessments for both AI providers
    - Sets up queue items for processing
    - Adds impact assessment results
*/

-- First, get a pending order and a Federal Register order for testing
DO $$ 
DECLARE
  pending_order_id uuid;
  fr_order_id uuid;
  policy_doc_id uuid;
BEGIN
  -- Get a pending order
  SELECT id INTO pending_order_id
  FROM executive_orders
  WHERE status = 'pending'
  LIMIT 1;

  -- Get a verified order from Federal Register
  SELECT id INTO fr_order_id
  FROM executive_orders
  WHERE status = 'verified'
  AND federal_register_id IS NOT NULL
  LIMIT 1;

  -- Get a policy document to test against
  SELECT id INTO policy_doc_id
  FROM policy_documents
  LIMIT 1;

  -- Create test AI assessments for pending order
  IF pending_order_id IS NOT NULL AND policy_doc_id IS NOT NULL THEN
    INSERT INTO ai_assessments (
      executive_order_id,
      policy_document_id,
      provider,
      assessment_text,
      rating,
      confidence
    ) VALUES
    (pending_order_id, policy_doc_id, 'latimer',
     'Test assessment for pending order using Latimer. The documents show moderate alignment.',
     'neutral', 0.75),
    (pending_order_id, policy_doc_id, 'perplexity',
     'Test assessment for pending order using Perplexity. The documents indicate positive alignment.',
     'positive', 0.85);

    -- Create impact assessment for pending order
    INSERT INTO impact_assessments (
      executive_order_id,
      policy_document_id,
      final_rating,
      confidence,
      last_updated
    ) VALUES
    (pending_order_id, policy_doc_id, 'positive', 0.80, now());
  END IF;

  -- Create test AI assessments for Federal Register order
  IF fr_order_id IS NOT NULL AND policy_doc_id IS NOT NULL THEN
    INSERT INTO ai_assessments (
      executive_order_id,
      policy_document_id,
      provider,
      assessment_text,
      rating,
      confidence
    ) VALUES
    (fr_order_id, policy_doc_id, 'latimer',
     'Test assessment for Federal Register order using Latimer. The documents show strong alignment.',
     'positive', 0.90),
    (fr_order_id, policy_doc_id, 'perplexity',
     'Test assessment for Federal Register order using Perplexity. The documents indicate positive alignment.',
     'positive', 0.95);

    -- Create impact assessment for Federal Register order
    INSERT INTO impact_assessments (
      executive_order_id,
      policy_document_id,
      final_rating,
      confidence,
      last_updated
    ) VALUES
    (fr_order_id, policy_doc_id, 'positive', 0.925, now());
  END IF;

  -- Add test queue items
  IF pending_order_id IS NOT NULL AND policy_doc_id IS NOT NULL THEN
    INSERT INTO assessment_queue (
      executive_order_id,
      policy_document_id,
      provider,
      status,
      priority,
      attempts
    ) VALUES
    (pending_order_id, policy_doc_id, 'latimer', 'completed', 1, 1),
    (pending_order_id, policy_doc_id, 'perplexity', 'completed', 1, 1);
  END IF;

  IF fr_order_id IS NOT NULL AND policy_doc_id IS NOT NULL THEN
    INSERT INTO assessment_queue (
      executive_order_id,
      policy_document_id,
      provider,
      status,
      priority,
      attempts
    ) VALUES
    (fr_order_id, policy_doc_id, 'latimer', 'completed', 2, 1),
    (fr_order_id, policy_doc_id, 'perplexity', 'completed', 2, 1);
  END IF;
END $$;