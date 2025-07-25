-- Create linking_invitations table for temporary invitation codes
CREATE TABLE IF NOT EXISTS linking_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invitation_code VARCHAR(10) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create patient_caregiver_connections table for established connections
CREATE TABLE IF NOT EXISTS patient_caregiver_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    caregiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (connection_status IN ('active', 'inactive', 'pending')),
    invitation_code VARCHAR(10) REFERENCES linking_invitations(invitation_code),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique patient-caregiver pairs
    UNIQUE(patient_id, caregiver_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_linking_invitations_code ON linking_invitations(invitation_code);
CREATE INDEX IF NOT EXISTS idx_linking_invitations_patient_id ON linking_invitations(patient_id);
CREATE INDEX IF NOT EXISTS idx_linking_invitations_status ON linking_invitations(status);
CREATE INDEX IF NOT EXISTS idx_linking_invitations_expires_at ON linking_invitations(expires_at);

CREATE INDEX IF NOT EXISTS idx_patient_caregiver_connections_patient_id ON patient_caregiver_connections(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_caregiver_connections_caregiver_id ON patient_caregiver_connections(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_patient_caregiver_connections_status ON patient_caregiver_connections(connection_status);

-- Enable Row Level Security (RLS)
ALTER TABLE linking_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_caregiver_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for linking_invitations
-- Patients can create and view their own invitations
CREATE POLICY "Patients can manage their own invitations" ON linking_invitations
    FOR ALL USING (auth.uid() = patient_id);

-- Caregivers can view invitations when accepting (handled by edge function with service role)
-- No direct policy needed as edge functions use service role

-- RLS Policies for patient_caregiver_connections  
-- Patients can view connections where they are the patient
CREATE POLICY "Patients can view their caregiver connections" ON patient_caregiver_connections
    FOR SELECT USING (auth.uid() = patient_id);

-- Caregivers can view connections where they are the caregiver
CREATE POLICY "Caregivers can view their patient connections" ON patient_caregiver_connections
    FOR SELECT USING (auth.uid() = caregiver_id);

-- Only edge functions can insert/update/delete connections (using service role)
-- Users cannot directly modify connections, only through the invitation system

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at on row changes
CREATE TRIGGER update_linking_invitations_updated_at 
    BEFORE UPDATE ON linking_invitations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_caregiver_connections_updated_at 
    BEFORE UPDATE ON patient_caregiver_connections 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired invitations (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE linking_invitations 
    SET status = 'expired' 
    WHERE status = 'pending' 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ language 'plpgsql'; 