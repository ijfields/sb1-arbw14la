/*
  # Add White House tracking capabilities

  1. Changes
    - Add whitehouse_title column to executive_orders table
    - Add whitehouse_date column to executive_orders table
    - Create title_matches table for tracking potential matches

  2. Security
    - Enable RLS on new table
    - Add policies for public read access
*/

-- Add White House specific columns to executive_orders
ALTER TABLE executive_orders 
ADD COLUMN IF NOT EXISTS whitehouse_title text,
ADD COLUMN IF NOT EXISTS whitehouse_date timestamptz;

-- Create table for tracking potential matches
CREATE TABLE IF NOT EXISTS title_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whitehouse_title text NOT NULL,
  whitehouse_date timestamptz NOT NULL,
  whitehouse_url text NOT NULL,
  federal_register_id text REFERENCES executive_orders(federal_register_id),
  match_confidence float DEFAULT 0.0,
  matched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE title_matches ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Allow public read access to title matches"
  ON title_matches
  FOR SELECT
  TO public
  USING (true);

-- Create policy for anonymous inserts
CREATE POLICY "Allow anonymous inserts to title matches"
  ON title_matches
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_title_matches_whitehouse_date 
  ON title_matches(whitehouse_date);
CREATE INDEX IF NOT EXISTS idx_title_matches_federal_register_id 
  ON title_matches(federal_register_id);