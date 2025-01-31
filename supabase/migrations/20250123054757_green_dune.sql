/*
  # Add assessment queue table and optimize for latest EO

  1. New Tables
    - `assessment_queue`
      - `id` (uuid, primary key)
      - `executive_order_id` (uuid, references executive_orders)
      - `policy_document_id` (uuid, references policy_documents)
      - `provider` (ai_provider)
      - `status` (queue_status)
      - `priority` (integer)
      - `attempts` (integer)
      - `error` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Add queue_status enum type
    - Add priority field for processing order
    - Add indexes for efficient querying

  3. Security
    - Enable RLS
    - Add policies for public access
*/

-- Create queue status enum
CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create assessment queue table
CREATE TABLE IF NOT EXISTS assessment_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_order_id uuid REFERENCES executive_orders(id),
  policy_document_id uuid REFERENCES policy_documents(id),
  provider ai_provider NOT NULL,
  status queue_status NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(executive_order_id, policy_document_id, provider)
);

-- Enable RLS
ALTER TABLE assessment_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to assessment queue"
  ON assessment_queue FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert to assessment queue"
  ON assessment_queue FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update to assessment queue"
  ON assessment_queue FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_assessment_queue_status ON assessment_queue(status);
CREATE INDEX IF NOT EXISTS idx_assessment_queue_priority ON assessment_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_queue_created ON assessment_queue(created_at);