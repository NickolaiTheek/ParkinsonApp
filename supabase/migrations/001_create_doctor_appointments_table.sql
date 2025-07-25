-- Create doctor_appointments table for managing medical appointments
CREATE TABLE IF NOT EXISTS doctor_appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255) NOT NULL,
    doctor_specialty VARCHAR(255) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    location TEXT NOT NULL,
    notes TEXT,
    appointment_type VARCHAR(50) NOT NULL DEFAULT 'in-person' CHECK (appointment_type IN ('in-person', 'telemedicine', 'phone')),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notification_id TEXT, -- Store Expo notification ID for cancellation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_doctor_appointments_patient_id ON doctor_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_doctor_appointments_date ON doctor_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_doctor_appointments_status ON doctor_appointments(status);

-- Enable Row Level Security (RLS)
ALTER TABLE doctor_appointments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own appointments
CREATE POLICY "Users can view their own appointments" ON doctor_appointments
    FOR SELECT USING (auth.uid() = patient_id);

-- Users can insert their own appointments
CREATE POLICY "Users can insert their own appointments" ON doctor_appointments
    FOR INSERT WITH CHECK (auth.uid() = patient_id);

-- Users can update their own appointments
CREATE POLICY "Users can update their own appointments" ON doctor_appointments
    FOR UPDATE USING (auth.uid() = patient_id);

-- Users can delete their own appointments
CREATE POLICY "Users can delete their own appointments" ON doctor_appointments
    FOR DELETE USING (auth.uid() = patient_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at on row changes
CREATE TRIGGER update_doctor_appointments_updated_at 
    BEFORE UPDATE ON doctor_appointments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 