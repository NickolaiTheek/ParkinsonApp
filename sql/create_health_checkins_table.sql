-- Create health_checkins table for daily patient check-ins
CREATE TABLE IF NOT EXISTS health_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  response TEXT NOT NULL,
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_health_checkins_user_date 
ON health_checkins(user_id, checkin_date);

CREATE INDEX IF NOT EXISTS idx_health_checkins_question 
ON health_checkins(question_id);

-- Create RLS policies
ALTER TABLE health_checkins ENABLE ROW LEVEL SECURITY;

-- Users can only access their own check-ins
CREATE POLICY "Users can view own health checkins"
ON health_checkins FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health checkins"
ON health_checkins FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health checkins"
ON health_checkins FOR UPDATE
USING (auth.uid() = user_id);

-- Optional: Allow caregivers to view patient check-ins
CREATE POLICY "Caregivers can view patient health checkins"
ON health_checkins FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM patient_caregiver_connections pcc
    WHERE pcc.patient_id = health_checkins.user_id
    AND pcc.caregiver_id = auth.uid()
    AND pcc.connection_status = 'active'
  )
); 