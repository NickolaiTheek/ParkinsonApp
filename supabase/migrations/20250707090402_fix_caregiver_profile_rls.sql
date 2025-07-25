-- Drop the existing, faulty RLS policy for caregivers viewing patient profiles.
-- The policy name must match exactly what is in the database.
DROP POLICY IF EXISTS "Caregivers can view connected patients" ON public.profiles;

-- Create a new, corrected RLS policy.
-- This policy correctly allows a caregiver (identified by auth.uid()) to view the
-- profile of any user whose ID (profiles.id) appears as a `patient_id` in a
-- `patient_caregiver_connections` record where the `caregiver_id` matches.
CREATE POLICY "Caregivers can view connected patient profiles" ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.patient_caregiver_connections pcc
    WHERE
      pcc.patient_id = public.profiles.id AND
      pcc.caregiver_id = auth.uid()
  )
); 