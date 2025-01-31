/*
  # Add RLS policies for executive orders table

  1. Changes
    - Add RLS policy to allow inserting records
    - Add RLS policy to allow updating records
    - Keep existing policy for reading records

  2. Security
    - Maintains public read access
    - Allows authenticated service role to insert/update records
*/

-- Allow service role to insert records
CREATE POLICY "Service role can insert executive orders"
  ON executive_orders
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow service role to update records
CREATE POLICY "Service role can update executive orders"
  ON executive_orders
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);