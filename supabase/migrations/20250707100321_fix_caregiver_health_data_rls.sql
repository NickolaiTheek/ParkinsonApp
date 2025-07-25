-- Grant caregivers read access to connected patients' appointments.
CREATE POLICY "Caregivers can view connected patient appointments"
ON public.doctor_appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.patient_caregiver_connections pcc
    WHERE
      pcc.patient_id = public.doctor_appointments.patient_id AND
      pcc.caregiver_id = auth.uid()
  )
);

-- Grant caregivers read access to connected patients' medication logs.
CREATE POLICY "Caregivers can view connected patient medication logs"
ON public.medication_administration_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.patient_caregiver_connections pcc
    WHERE
      pcc.patient_id = public.medication_administration_logs.user_id AND
      pcc.caregiver_id = auth.uid()
  )
);

-- Grant caregivers read access to connected patients' health metrics.
CREATE POLICY "Caregivers can view connected patient health metrics"
ON public.health_metrics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.patient_caregiver_connections pcc
    WHERE
      pcc.patient_id = public.health_metrics.patient_id AND
      pcc.caregiver_id = auth.uid()
  )
); 