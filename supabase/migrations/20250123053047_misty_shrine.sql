/*
  # Add RLS policies for policy documents

  1. Changes
    - Add RLS policy to allow anonymous inserts to policy_documents table
    - Add RLS policy to allow anonymous updates to policy_documents table
    
  2. Security
    - Maintains read-only access for public users
    - Adds write access for anonymous users (required for document upload)
*/

-- Allow anonymous inserts to policy_documents
CREATE POLICY "Allow anonymous inserts to policy documents"
  ON policy_documents
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow anonymous updates to policy_documents
CREATE POLICY "Allow anonymous updates to policy documents"
  ON policy_documents
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);