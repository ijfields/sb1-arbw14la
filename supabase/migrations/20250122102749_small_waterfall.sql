/*
  # Update RLS policies for executive orders table

  1. Changes
    - Modify RLS policies to allow anonymous access for development
    - This is temporary and should be replaced with proper authentication

  2. Security
    - Allows public access for development purposes
    - WARNING: This is not suitable for production!
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Service role can insert executive orders" ON executive_orders;
DROP POLICY IF EXISTS "Service role can update executive orders" ON executive_orders;

-- Allow anonymous inserts
CREATE POLICY "Allow anonymous inserts to executive orders"
  ON executive_orders
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow anonymous updates
CREATE POLICY "Allow anonymous updates to executive orders"
  ON executive_orders
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);