/*
  # Add Policy Documents and AI Assessments Schema

  1. New Tables
    - `policy_documents`
      - Stores PDF documents and their extracted text
    - `ai_assessments`
      - Stores AI evaluations from both Latimer and Perplexity
    - `impact_assessments`
      - Links executive orders to policy documents with impact ratings

  2. Security
    - Enable RLS on all new tables
    - Add policies for public read access
*/

-- Create enum for impact ratings
CREATE TYPE impact_rating AS ENUM ('positive', 'neutral', 'negative');

-- Create enum for AI providers
CREATE TYPE ai_provider AS ENUM ('latimer', 'perplexity');

-- Create policy documents table
CREATE TABLE IF NOT EXISTS policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  document_type text NOT NULL,
  content text NOT NULL,
  pdf_data bytea NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create AI assessments table
CREATE TABLE IF NOT EXISTS ai_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_order_id uuid REFERENCES executive_orders(id),
  policy_document_id uuid REFERENCES policy_documents(id),
  provider ai_provider NOT NULL,
  assessment_text text NOT NULL,
  rating impact_rating NOT NULL,
  confidence float NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(executive_order_id, policy_document_id, provider)
);

-- Create impact assessments table for quick lookups
CREATE TABLE IF NOT EXISTS impact_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_order_id uuid REFERENCES executive_orders(id),
  policy_document_id uuid REFERENCES policy_documents(id),
  final_rating impact_rating NOT NULL,
  confidence float NOT NULL,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(executive_order_id, policy_document_id)
);

-- Enable RLS
ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE impact_assessments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to policy documents"
  ON policy_documents FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read access to ai assessments"
  ON ai_assessments FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read access to impact assessments"
  ON impact_assessments FOR SELECT TO public USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_assessments_eo_id ON ai_assessments(executive_order_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_policy_id ON ai_assessments(policy_document_id);
CREATE INDEX IF NOT EXISTS idx_impact_assessments_eo_id ON impact_assessments(executive_order_id);
CREATE INDEX IF NOT EXISTS idx_impact_assessments_policy_id ON impact_assessments(policy_document_id);