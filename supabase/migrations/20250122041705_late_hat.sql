/*
  # Executive Orders Schema

  1. New Tables
    - `executive_orders`
      - Stores all executive orders with their metadata
      - Includes source tracking and verification status
    - `order_sources`
      - Tracks where each order was discovered
      - Helps reconcile data between Federal Register and WhiteHouse.gov
  
  2. Security
    - Enable RLS on all tables
    - Add policies for read access
*/

-- Create enum for order sources
CREATE TYPE order_source AS ENUM ('federal_register', 'whitehouse');

-- Create enum for verification status
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'superseded', 'revoked');

-- Create executive orders table
CREATE TABLE IF NOT EXISTS executive_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  title text NOT NULL,
  signing_date timestamptz,
  publication_date timestamptz,
  summary text,
  category text,
  status verification_status DEFAULT 'pending',
  federal_register_id text UNIQUE,
  whitehouse_url text UNIQUE,
  federal_register_url text,
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create order sources tracking table
CREATE TABLE IF NOT EXISTS order_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES executive_orders(id),
  source order_source NOT NULL,
  external_id text,
  discovered_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(order_id, source)
);

-- Enable RLS
ALTER TABLE executive_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_sources ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to executive orders"
  ON executive_orders
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read access to order sources"
  ON order_sources
  FOR SELECT
  TO public
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_executive_orders_updated_at
  BEFORE UPDATE ON executive_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_executive_orders_signing_date ON executive_orders(signing_date);
CREATE INDEX IF NOT EXISTS idx_executive_orders_status ON executive_orders(status);
CREATE INDEX IF NOT EXISTS idx_order_sources_source ON order_sources(source);