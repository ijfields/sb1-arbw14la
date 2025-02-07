-- Create token usage tracking table
CREATE TABLE IF NOT EXISTS token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  tokens integer NOT NULL,
  cost decimal(10, 4) DEFAULT 0,
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to token usage"
  ON token_usage FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert to token usage"
  ON token_usage FOR INSERT TO public WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp 
  ON token_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider 
  ON token_usage(provider);