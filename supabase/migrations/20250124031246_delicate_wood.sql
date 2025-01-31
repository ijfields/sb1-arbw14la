/*
  # Update PDF data storage format
  
  1. Changes
    - Modify pdf_data column in policy_documents table from bytea to text
    - Add NOT NULL constraint to ensure data integrity
  
  2. Reason
    - Better compatibility with base64-encoded PDF data
    - Improved storage and retrieval of PDF documents
*/

ALTER TABLE policy_documents 
  ALTER COLUMN pdf_data TYPE text USING pdf_data::text;

-- Ensure the column remains NOT NULL
ALTER TABLE policy_documents 
  ALTER COLUMN pdf_data SET NOT NULL;