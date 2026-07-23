/*
  # Revoke anonymous/public write policies (issue #3)

  The Supabase anon key is public by design — it is shipped in every client
  bundle — so it must never carry write privileges. All database writes now go
  through the Express admin API (server/adminApi.js) using the service-role key,
  which bypasses RLS. This migration drops every anon/public INSERT and UPDATE
  policy on the six affected tables.

  The public SELECT policies are intentionally left in place: the client still
  reads directly with the anon key.

  Tables and dropped policies:
    - executive_orders   (insert + update)
    - policy_documents   (insert + update)
    - title_matches      (insert)
    - assessment_queue   (insert + update)
    - ai_assessments     (insert + update)
    - impact_assessments (insert + update)
*/

-- executive_orders (from 20250122102749_small_waterfall.sql)
DROP POLICY IF EXISTS "Allow anonymous inserts to executive orders" ON executive_orders;
DROP POLICY IF EXISTS "Allow anonymous updates to executive orders" ON executive_orders;

-- policy_documents (from 20250123053047_misty_shrine.sql)
DROP POLICY IF EXISTS "Allow anonymous inserts to policy documents" ON policy_documents;
DROP POLICY IF EXISTS "Allow anonymous updates to policy documents" ON policy_documents;

-- title_matches (from 20250122123916_long_darkness.sql)
DROP POLICY IF EXISTS "Allow anonymous inserts to title matches" ON title_matches;

-- assessment_queue (from 20250123054757_green_dune.sql)
DROP POLICY IF EXISTS "Allow public insert to assessment queue" ON assessment_queue;
DROP POLICY IF EXISTS "Allow public update to assessment queue" ON assessment_queue;

-- ai_assessments (from 20260711000000_assessment_write_policies.sql)
DROP POLICY IF EXISTS "Allow public insert to ai assessments" ON ai_assessments;
DROP POLICY IF EXISTS "Allow public update to ai assessments" ON ai_assessments;

-- impact_assessments (from 20260711000000_assessment_write_policies.sql)
DROP POLICY IF EXISTS "Allow public insert to impact assessments" ON impact_assessments;
DROP POLICY IF EXISTS "Allow public update to impact assessments" ON impact_assessments;
