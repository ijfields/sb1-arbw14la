/*
  # Assessment write policies (DEVELOPMENT ONLY)

  1. Changes
    - Add anon INSERT + UPDATE policies for `ai_assessments`
    - Add anon INSERT + UPDATE policies for `impact_assessments`

  2. Security
    - These tables previously had SELECT-only policies, so the client-side
      assessment pipeline (queueService) could not persist AI results — anon
      writes were denied with Postgres error 42501.
    - The policies below open anon INSERT/UPDATE for local development so the
      pipeline can store results end-to-end.
    - NOTE: These are development-only policies. All anon-write policies are
      slated to be removed in favor of server-side writes (with the service
      role key) in issue #3; the client will no longer write to these tables.
*/

-- ai_assessments: allow anon insert + update (dev only)
CREATE POLICY "Allow public insert to ai assessments"
  ON ai_assessments FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update to ai assessments"
  ON ai_assessments FOR UPDATE TO public USING (true) WITH CHECK (true);

-- impact_assessments: allow anon insert + update (dev only)
CREATE POLICY "Allow public insert to impact assessments"
  ON impact_assessments FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update to impact assessments"
  ON impact_assessments FOR UPDATE TO public USING (true) WITH CHECK (true);
